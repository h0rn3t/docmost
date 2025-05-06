import {
    BadRequestException,
    Body,
    Controller,
    ForbiddenException,
    HttpCode,
    HttpStatus,
    NotFoundException,
    Post,
    UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AuthUser } from '../../common/decorators/auth-user.decorator';
import { User, Workspace } from '@docmost/db/types/entity.types';
import { AuthWorkspace } from '../../common/decorators/auth-workspace.decorator';
import { PagePermissionService } from './services/page-permission.service';
import {
    AddPagePermissionDto,
    AddPagePermissionsBatchDto,
    PageIdDto,
    PagePermissionIdDto,
    RemovePagePermissionDto,
    UpdatePagePermissionDto,
} from './dto/page-permission.dto';
import { PaginationOptions } from '@docmost/db/pagination/pagination-options';
import { PageRepo } from '@docmost/db/repos/page/page.repo';
import SpaceAbilityFactory from '../casl/abilities/space-ability.factory';
import {
    SpaceCaslAction,
    SpaceCaslSubject,
} from '../casl/interfaces/space-ability.type';

@UseGuards(JwtAuthGuard)
@Controller('page-permissions')
export class PagePermissionController {
    constructor(
        private readonly pagePermissionService: PagePermissionService,
        private readonly pageRepo: PageRepo,
        private readonly spaceAbility: SpaceAbilityFactory,
    ) {
    }

    @HttpCode(HttpStatus.OK)
    @Post('/')
    async getPagePermissions(
        @Body() dto: PageIdDto,
        @Body() pagination: PaginationOptions,
        @AuthUser() user: User,
    ) {
        const page = await this.pageRepo.findById(dto.pageId);
        if (!page) {
            throw new NotFoundException('Page not found');
        }

        const ability = await this.spaceAbility.createForUser(user, page.spaceId);
        if (ability.cannot(SpaceCaslAction.Read, SpaceCaslSubject.PagePermission)) {
            throw new ForbiddenException();
        }

        return this.pagePermissionService.getPagePermissions(dto.pageId, pagination);
    }

    @HttpCode(HttpStatus.OK)
    @Post('add')
    async addPermission(
        @Body() dto: AddPagePermissionDto,
        @AuthUser() user: User,
    ) {
        const page = await this.pageRepo.findById(dto.pageId);
        if (!page) {
            throw new NotFoundException('Page not found');
        }

        const ability = await this.spaceAbility.createForUser(user, page.spaceId);
        if (ability.cannot(SpaceCaslAction.Manage, SpaceCaslSubject.PagePermission)) {
            throw new ForbiddenException();
        }

        return this.pagePermissionService.addPermission(dto, user);
    }

    @HttpCode(HttpStatus.OK)
    @Post('add-batch')
    async addPermissionsBatch(
        @Body() dto: AddPagePermissionsBatchDto,
        @AuthUser() user: User,
    ) {
        const page = await this.pageRepo.findById(dto.pageId);
        if (!page) {
            throw new NotFoundException('Page not found');
        }

        const ability = await this.spaceAbility.createForUser(user, page.spaceId);
        if (ability.cannot(SpaceCaslAction.Manage, SpaceCaslSubject.PagePermission)) {
            throw new ForbiddenException();
        }

        return this.pagePermissionService.addPermissionsBatch(dto, user);
    }

    // @HttpCode(HttpStatus.OK)
    // @Post('update')
    // async updatePermission(
    //     @Body() dto: UpdatePagePermissionDto,
    //     @AuthUser() user: User,
    // ) {
    //     const permission = await this.getPermissionAndCheckAccess(
    //         dto.permissionId,
    //         user,
    //         SpaceCaslAction.Manage,
    //     );
    //
    //     return this.pagePermissionService.updatePermission(dto);
    // }

}
