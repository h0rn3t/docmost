import {
    BadRequestException,
    Injectable,
    Logger,
    NotFoundException,
} from '@nestjs/common';
import { PagePermissionRepo } from '@docmost/db/repos/page/page-permission.repo';
import { AddPagePermissionDto, AddPagePermissionsBatchDto, UpdatePagePermissionDto } from '../dto/page-permission.dto';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { PaginationOptions } from '@docmost/db/pagination/pagination-options';
import { PageRepo } from '@docmost/db/repos/page/page.repo';
import { User } from '@docmost/db/types/entity.types';
import { executeTx } from '@docmost/db/utils';
import { SpaceRole } from '../../../common/helpers/types/permission';

@Injectable()
export class PagePermissionService {
    private readonly logger = new Logger(PagePermissionService.name);

    constructor(
        private readonly pagePermissionRepo: PagePermissionRepo,
        private readonly pageRepo: PageRepo,
        @InjectKysely() private readonly db: KyselyDB,
    ) {}

    async getPagePermissions(pageId: string, pagination: PaginationOptions) {
        const page = await this.pageRepo.findById(pageId);
        if (!page) {
            throw new NotFoundException('Page not found');
        }

        return this.pagePermissionRepo.getPermissionsByPageId(pageId, pagination);
    }

    async addPermission(dto: AddPagePermissionDto, authUser: User) {
        const page = await this.pageRepo.findById(dto.pageId);
        if (!page) {
            throw new NotFoundException('Page not found');
        }

        if (!dto.userId && !dto.groupId) {
            throw new BadRequestException('Either userId or groupId must be provided');
        }

        if (dto.userId && dto.groupId) {
            throw new BadRequestException('Only one of userId or groupId can be provided');
        }

        // Проверяем, существует ли уже такое разрешение
        let existingPermission = null;
        if (dto.userId) {
            existingPermission = await this.pagePermissionRepo.findByPageIdAndUserId(
                dto.pageId,
                dto.userId,
            );
        } else if (dto.groupId) {
            existingPermission = await this.pagePermissionRepo.findByPageIdAndGroupId(
                dto.pageId,
                dto.groupId,
            );
        }

        if (existingPermission) {
            throw new BadRequestException('Permission already exists');
        }

        const permission = await this.pagePermissionRepo.insertPagePermission({
            pageId: dto.pageId,
            userId: dto.userId || null,
            groupId: dto.groupId || null,
            role: dto.role,
            addedById: authUser.id,
            workspaceId: page.workspaceId,
        });

        return permission;
    }

    async addPermissionsBatch(dto: AddPagePermissionsBatchDto, authUser: User) {
        const page = await this.pageRepo.findById(dto.pageId);
        if (!page) {
            throw new NotFoundException('Page not found');
        }

        if ((!dto.userIds || dto.userIds.length === 0) &&
            (!dto.groupIds || dto.groupIds.length === 0)) {
            throw new BadRequestException('Either userIds or groupIds must be provided');
        }

        const permissionsToAdd = [];

        // Подготовка разрешений для пользователей
        if (dto.userIds && dto.userIds.length > 0) {
            const existingUserPermissions = await this.db
                .selectFrom('pagePermissions')
                .select(['userId'])
                .where('pageId', '=', dto.pageId)
                .where('userId', 'in', dto.userIds)
                .execute();

            const existingUserIds = new Set(existingUserPermissions.map((p) => p.userId));

            for (const userId of dto.userIds) {
                if (!existingUserIds.has(userId)) {
                    permissionsToAdd.push({
                        pageId: dto.pageId,
                        userId,
                        groupId: null,
                        role: dto.role,
                        addedById: authUser.id,
                        workspaceId: page.workspaceId,
                    });
                }
            }
        }

        // Подготовка разрешений для групп
        if (dto.groupIds && dto.groupIds.length > 0) {
            const existingGroupPermissions = await this.db
                .selectFrom('pagePermissions')
                .select(['groupId'])
                .where('pageId', '=', dto.pageId)
                .where('groupId', 'in', dto.groupIds)
                .execute();

            const existingGroupIds = new Set(existingGroupPermissions.map((p) => p.groupId));

            for (const groupId of dto.groupIds) {
                if (!existingGroupIds.has(groupId)) {
                    permissionsToAdd.push({
                        pageId: dto.pageId,
                        userId: null,
                        groupId,
                        role: dto.role,
                        addedById: authUser.id,
                        workspaceId: page.workspaceId,
                    });
                }
            }
        }

        // Добавляем разрешения пакетно
        if (permissionsToAdd.length > 0) {
            await this.db
                .insertInto('pagePermissions')
                .values(permissionsToAdd)
                .execute();
        }

        return { added: permissionsToAdd.length };
    }

    async updatePermission(dto: UpdatePagePermissionDto) {
        const permission = await this.pagePermissionRepo.findById(dto.permissionId);
        if (!permission) {
            throw new NotFoundException('Permission not found');
        }

        return this.pagePermissionRepo.updatePagePermission(
            {
                role: dto.role,
            },
            dto.permissionId,
        );
    }

    async removePermission(permissionId: string) {
        const permission = await this.pagePermissionRepo.findById(permissionId);
        if (!permission) {
            throw new NotFoundException('Permission not found');
        }

        await this.pagePermissionRepo.deletePagePermission(permissionId);
    }

    async checkPageAccess(pageId: string, userId: string): Promise<boolean> {
        // Получаем все роли пользователя для страницы
        const userRoles = await this.pagePermissionRepo.getUserPageRoles(userId, pageId);

        // Если есть какая-либо роль, значит доступ есть
        if (userRoles && userRoles.length > 0) {
            return true;
        }

        // Если нет прямых разрешений, проверяем, есть ли разрешения уровня Space
        const page = await this.pageRepo.findById(pageId);
        if (!page) {
            return false;
        }

        // Запрашиваем прокси-репозиторий, чтобы избежать циклической зависимости
        // Здесь нужно инжектировать SpaceMemberRepo и проверить разрешения пространства
        return false; // Заглушка, нужно дополнить в зависимости от архитектуры проекта
    }

    async getHighestPageRole(pageId: string, userId: string): Promise<string | null> {
        const userRoles = await this.pagePermissionRepo.getUserPageRoles(userId, pageId);

        if (!userRoles || userRoles.length === 0) {
            return null;
        }

        // Определяем приоритет ролей
        const rolePriority = {
            [SpaceRole.ADMIN]: 3,
            [SpaceRole.WRITER]: 2,
            [SpaceRole.READER]: 1,
        };

        // Находим роль с максимальным приоритетом
        let highestRole = null;
        let highestPriority = 0;

        for (const role of userRoles) {
            const priority = rolePriority[role] || 0;
            if (priority > highestPriority) {
                highestPriority = priority;
                highestRole = role;
            }
        }

        return highestRole;
    }
}