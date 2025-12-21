import {
    IsString,
    IsOptional,
    IsInt,
    IsBoolean,
    IsUrl,
    Min,
    MaxLength,
    IsJSON,
    ValidateIf,
    IsObject,
} from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateUserDto {
    @IsOptional()
    @IsString()
    @MaxLength(50)
    name?: string;

    @IsOptional()
    @IsUrl()
    profilePic?: string;

    @IsOptional()
    @IsString()
    @MaxLength(300)
    bio?: string;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(0)
    coin?: number;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(0)
    diamond?: number;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    level?: number;

    @IsOptional()
    @IsBoolean()
    vipStatus?: boolean;

    @IsOptional()
    @IsString()
    badge?: string;

    // settings: must be valid JSON or object
    @IsOptional()
    @ValidateIf(v => typeof v.settings === 'string')
    @IsJSON()
    settings?: any;

    @IsOptional()
    @ValidateIf(v => typeof v.settings === 'object')
    @IsObject()
    settingsObj?: any;

    // extra: same rules
    @IsOptional()
    @ValidateIf(v => typeof v.extra === 'string')
    @IsJSON()
    extra?: any;

    @IsOptional()
    @ValidateIf(v => typeof v.extra === 'object')
    @IsObject()
    extraObj?: any;
}
