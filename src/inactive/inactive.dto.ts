import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayNotEmpty, ArrayUnique, IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class InactiveQueryDto {
  @IsOptional() @IsString() @MaxLength(200) search?: string;
  @IsOptional() @IsIn(['all', 'banner', 'page', 'announcement']) cmsType?: string;
  @IsOptional() @IsIn(['all', 'in', 'out']) stock?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page: number = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit: number = 10;
}

export class ActivateInactiveDto extends InactiveQueryDto {
  @IsOptional() @IsBoolean() all?: boolean;
  @IsOptional() @IsArray() @ArrayNotEmpty() @ArrayMaxSize(100) @ArrayUnique() @IsString({ each: true }) ids?: string[];
}
