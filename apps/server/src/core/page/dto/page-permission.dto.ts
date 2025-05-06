import {
    ArrayMaxSize,
    ArrayMinSize,
    IsArray,
    IsEnum,
    IsNotEmpty,
    IsOptional,
    IsString,
    IsUUID,
} from 'class-validator';
import { SpaceRole } from '../../../common/helpers/types/permission';

export class PagePermissionIdDto {
    @IsUUID()
    @IsNotEmpty()
    permissionId: string;
}

export class PageIdDto {
    @IsString()
    @IsNotEmpty()
    pageId: string;
}

export class AddPagePermissionDto extends PageIdDto {
    @IsEnum(SpaceRole)
    role: string;

    @IsOptional()
    @IsUUID()
    userId?: string;

    @IsOptional()
    @IsUUID()
    groupId?: string;
}

export class AddPagePermissionsBatchDto extends PageIdDto {
    @IsEnum(SpaceRole)
    role: string;

    @IsOptional()
    @IsArray()
    @ArrayMaxSize(25)
    @IsUUID('all', { each: true })
    userIds?: string[];

    @IsOptional()
    @IsArray()
    @ArrayMaxSize(25)
    @IsUUID('all', { each: true })
    groupIds?: string[];
}

export class UpdatePagePermissionDto extends PagePermissionIdDto {
    @IsEnum(SpaceRole)
    role: string;
}

export class RemovePagePermissionDto extends PagePermissionIdDto {}