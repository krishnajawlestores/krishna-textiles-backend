import { Exclude, Transform, Type } from 'class-transformer';
import { PartialType } from '@nestjs/swagger';
import { ArrayMinSize, IsArray, IsBoolean, IsDateString, IsEmail, IsEnum, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Matches, Min, ValidateIf, ValidateNested } from 'class-validator';
import { CouponType, CustomerType, OfferTarget } from '@prisma/client';

// Preserve numeric form inputs without coercing null, booleans or empty strings to zero.
const Numeric = () => Transform(({ value }) => typeof value === 'string' && value.trim() ? Number(value) : value);
const Optional = () => ValidateIf((_object, value) => value !== undefined);
// Existing forms use an empty string to clear optional date fields.
const OptionalDate = () => Transform(({ value }) => value === '' ? null : value);

export class ValidateCouponDto {
  @IsString() @Matches(/\S/) code: string;
  @Numeric() @IsNumber() @Min(0) cartTotal: number;
}
export class CreateCouponDto {
  @IsString() @Matches(/\S/) code: string;
  @IsOptional() @IsString() description?: string;
  @Optional() @IsEnum(CouponType) type?: CouponType;
  @Numeric() @IsNumber() @Min(0) value: number;
  @Optional() @Numeric() @IsNumber() @Min(0) minOrderAmount?: number;
  @Transform(({ value }) => value === '' ? null : value) @IsOptional() @Numeric() @IsNumber() @Min(0) maxDiscountAmount?: number;
  @Transform(({ value }) => value === '' ? null : value) @IsOptional() @Numeric() @IsInt() @Min(0) usageLimit?: number;
  @OptionalDate() @IsOptional() @IsDateString() validFrom?: string;
  @OptionalDate() @IsOptional() @IsDateString() validUntil?: string;
  @Optional() @IsArray() @IsString({ each: true }) applicableCategories?: string[];
  @Optional() @IsBoolean() isActive?: boolean;
}
export class UpdateCouponDto extends PartialType(CreateCouponDto, { skipNullProperties: false }) {}

export class CreateOfferDto {
  @IsString() @Matches(/\S/) title: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() bannerImage?: string;
  @Optional() @IsEnum(CouponType) discountType?: CouponType;
  @Numeric() @IsNumber() @Min(0) discountValue: number;
  @Optional() @IsEnum(OfferTarget) targetType?: OfferTarget;
  @IsOptional() @IsString() targetId?: string;
  @IsOptional() @IsString() targetName?: string;
  @OptionalDate() @IsOptional() @IsDateString() startDate?: string;
  @OptionalDate() @IsOptional() @IsDateString() endDate?: string;
  @Optional() @Numeric() @IsInt() priority?: number;
  @IsOptional() @IsString() badgeText?: string;
  @Optional() @IsBoolean() isActive?: boolean;
}
export class UpdateOfferDto extends PartialType(CreateOfferDto, { skipNullProperties: false }) {}

// The CMS editor round-trips these server-owned fields. Accept but never write them.
class CmsReadOnlyDto {
  @Exclude({ toClassOnly: true }) id?: string;
  @Exclude({ toClassOnly: true }) createdAt?: string;
  @Exclude({ toClassOnly: true }) updatedAt?: string;
}
export class BannerDto extends CmsReadOnlyDto {
  @Optional() @IsString() title?: string;
  @Optional() @IsString() tag?: string;
  @Optional() @IsString() subtitle?: string;
  @Optional() @IsString() image?: string;
  @Optional() @IsString() linkUrl?: string;
  @Optional() @IsString() buttonText?: string;
  @Optional() @IsString() secondaryLinkUrl?: string;
  @Optional() @IsString() secondaryButtonText?: string;
  @Optional() @IsString() badgeText?: string;
  @Optional() @IsString() accentColor?: string;
  @Optional() @Numeric() @IsInt() priority?: number;
  @Optional() @IsBoolean() isActive?: boolean;
}
export class PageDto extends CmsReadOnlyDto {
  @Optional() @IsString() title?: string;
  @Optional() @IsString() slug?: string;
  @Optional() @IsString() content?: string;
  @Optional() @IsString() metaDescription?: string;
  @Optional() @IsBoolean() isPublished?: boolean;
  @Optional() @IsString() lastUpdatedBy?: string;
}
export class AnnouncementDto extends CmsReadOnlyDto {
  @Optional() @IsString() text?: string;
  @Optional() @IsString() linkUrl?: string;
  @Optional() @IsString() badgeText?: string;
  @Optional() @IsString() bgColor?: string;
  @Optional() @IsString() textColor?: string;
  @Optional() @IsBoolean() isActive?: boolean;
}

export class CreateCustomerDto {
  @IsString() @Matches(/\S/) name: string;
  @IsString() @Matches(/\S/) phone: string;
  @Transform(({ value }) => value === '' ? null : value) @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() company?: string;
  @IsOptional() @IsString() gstin?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() city?: string;
  @IsOptional() @IsString() state?: string;
  @IsOptional() @IsString() pincode?: string;
  @Optional() @IsEnum(CustomerType) type?: CustomerType;
  @Optional() @Numeric() @IsNumber() @Min(0) creditLimit?: number;
}
export class RegisterCustomerDto extends CreateCustomerDto {
  @Optional() @IsString() initialNote?: string;
}
export class UpdateCustomerDto extends PartialType(CreateCustomerDto, { skipNullProperties: false }) {}
export class CustomerNoteDto {
  @IsString() @Matches(/\S/) note: string;
}

export class AdjustStockDto {
  @IsString() @IsNotEmpty() productId: string;
  @Numeric() @IsInt() delta: number;
  @IsString() @Matches(/\S/) reason: string;
  @IsOptional() @IsString() note?: string;
  @IsOptional() @IsString() size?: string;
}
export class BulkAdjustStockDto {
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => AdjustStockDto)
  items: AdjustStockDto[];
}
export class StoreSettingsBodyDto {
  @Optional() @IsString() companyName?: string;
  @Optional() @IsString() companyTagline?: string;
  @Optional() @IsString() companyAddress?: string;
  @Optional() @IsString() companyCity?: string;
  @Optional() @IsString() companyState?: string;
  @Optional() @IsString() companyPincode?: string;
  @Optional() @IsString() companyPhone?: string;
  @Optional() @IsString() companyEmail?: string;
  @Optional() @IsString() companyGstin?: string;
  @Optional() @IsString() companyPan?: string;
  @Optional() @IsString() companyWebsite?: string;
  @Optional() @Numeric() @IsNumber() @Min(0) gstRate?: number;
  @Optional() @Numeric() @IsNumber() @Min(0) defaultDiscountRate?: number;
  @Optional() @Numeric() @IsNumber() @Min(0) minOrderValue?: number;
  @Optional() @Numeric() @IsNumber() @Min(0) freeShippingThreshold?: number;
}
export class UploadFileDto {
  @Optional() @IsString() folder?: string;
}
export class UploadBase64Dto extends UploadFileDto {
  @IsString() @IsNotEmpty() image: string;
  @Optional() @IsString() filename?: string;
}
export class FlushCacheDto {
  @Optional() @IsString() prefix?: string;
}
