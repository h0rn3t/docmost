import { Injectable } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB, KyselyTransaction } from '../../types/kysely.types';
import { dbOrTx } from '../../utils';
import {
  InsertablePagePermission,
  PagePermission,
  UpdatablePagePermission,
} from '@docmost/db/types/entity.types';
import { PaginationOptions } from '../../pagination/pagination-options';
import { executeWithPagination } from '../../pagination/pagination';
import { DB } from '@docmost/db/types/db';

@Injectable()
export class PagePermissionRepo {
  constructor(@InjectKysely() private readonly db: KyselyDB) {}

  private baseFields: Array<keyof PagePermission> = [
    'id',
    'pageId',
    'userId',
    'groupId',
    'role',
    'addedById',
    'workspaceId',
    'createdAt',
    'updatedAt',
    'deletedAt',
  ];

  async findById(permissionId: string, trx?: KyselyTransaction): Promise<PagePermission> {
    const db = dbOrTx(this.db, trx);
    return db
      .selectFrom('pagePermissions')
      .select(this.baseFields)
      .where('id', '=', permissionId)
      .executeTakeFirst();
  }

  async findByPageIdAndUserId(
    pageId: string,
    userId: string,
    trx?: KyselyTransaction,
  ): Promise<PagePermission> {
    const db = dbOrTx(this.db, trx);
    return db
      .selectFrom('pagePermissions')
      .select(this.baseFields)
      .where('pageId', '=', pageId)
      .where('userId', '=', userId)
      .executeTakeFirst();
  }

  async findByPageIdAndGroupId(
    pageId: string,
    groupId: string,
    trx?: KyselyTransaction,
  ): Promise<PagePermission> {
    const db = dbOrTx(this.db, trx);
    return db
      .selectFrom('pagePermissions')
      .select(this.baseFields)
      .where('pageId', '=', pageId)
      .where('groupId', '=', groupId)
      .executeTakeFirst();
  }

  async insertPagePermission(
    insertable: InsertablePagePermission,
    trx?: KyselyTransaction,
  ): Promise<PagePermission> {
    const db = dbOrTx(this.db, trx);
    return db
      .insertInto('pagePermissions')
      .values(insertable)
      .returning(this.baseFields)
      .executeTakeFirst();
  }

  async updatePagePermission(
    updatable: UpdatablePagePermission,
    permissionId: string,
    trx?: KyselyTransaction,
  ): Promise<PagePermission> {
    const db = dbOrTx(this.db, trx);
    return db
      .updateTable('pagePermissions')
      .set({ ...updatable, updatedAt: new Date() })
      .where('id', '=', permissionId)
      .returning(this.baseFields)
      .executeTakeFirst();
  }

  async deletePagePermission(permissionId: string, trx?: KyselyTransaction): Promise<void> {
    const db = dbOrTx(this.db, trx);
    await db.deleteFrom('pagePermissions').where('id', '=', permissionId).execute();
  }

  async getPermissionsByPageId(pageId: string, pagination: PaginationOptions) {
    let query = this.db
      .selectFrom('pagePermissions')
      .leftJoin('users', 'users.id', 'pagePermissions.userId')
      .leftJoin('groups', 'groups.id', 'pagePermissions.groupId')
      .select([
        'pagePermissions.id',
        'pagePermissions.role',
        'pagePermissions.createdAt',
        'users.id as userId',
        'users.name as userName',
        'users.email as userEmail',
        'users.avatarUrl as userAvatarUrl',
        'groups.id as groupId',
        'groups.name as groupName',
        'groups.isDefault as groupIsDefault',
      ])
      .where('pagePermissions.pageId', '=', pageId)
      .orderBy('pagePermissions.createdAt', 'asc');

    const result = await executeWithPagination(query, {
      page: pagination.page,
      perPage: pagination.limit,
    });

    return result;
  }

  async getUserPageRoles(userId: string, pageId: string): Promise<string[]> {
    const roles = await this.db
      .selectFrom('pagePermissions')
      .select(['pagePermissions.role'])
      .where('pagePermissions.userId', '=', userId)
      .where('pagePermissions.pageId', '=', pageId)
      .unionAll(
        this.db
          .selectFrom('pagePermissions')
          .innerJoin('groupUsers', 'groupUsers.groupId', 'pagePermissions.groupId')
          .select(['pagePermissions.role'])
          .where('groupUsers.userId', '=', userId)
          .where('pagePermissions.pageId', '=', pageId),
      )
      .execute();

    return roles.map((r) => r.role);
  }
}
