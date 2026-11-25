import { OrderStatus, PaymentStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, Equals, IsArray, IsEmail, IsEnum, IsDateString, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Min, ValidateNested } from 'class-validator';

export class OrderItemDto {
  @IsString() @IsNotEmpty() productId: string;
  @IsString() @IsNotEmpty() productName: string;
  @IsOptional() @IsString() size?: string;
  @IsOptional() @IsString() color?: string;
  @IsInt() @Min(1) quantity: number;
  @IsNumber() @Min(0) unitPrice: number;
}
export class CreateOrderDto {
  @IsString() @IsNotEmpty() customerName: string;
  @IsString() @IsNotEmpty() customerPhone: string;
  @IsOptional() @IsEmail() customerEmail?: string;
  @IsString() @IsNotEmpty() shippingAddress: string;
  @IsOptional() @IsString() paymentMethod?: string;
  @IsOptional() @Equals('UNPAID') paymentStatus?: 'UNPAID';
  @IsOptional() @IsString() notes?: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100) @ValidateNested({ each: true }) @Type(() => OrderItemDto)
  items: OrderItemDto[];
}
export class VerifyPaymentDto {
  @IsString() @IsNotEmpty() razorpayOrderId: string;
  @IsString() @IsNotEmpty() razorpayPaymentId: string;
  @IsString() @IsNotEmpty() razorpaySignature: string;
  @ValidateNested() @Type(() => CreateOrderDto) @IsNotEmpty() orderData: CreateOrderDto;
}

export class UpdateOrderStatusDto {
  @IsEnum(OrderStatus) status: OrderStatus;
  @IsOptional() @IsString() trackingNumber?: string;
  @IsOptional() @IsString() courierPartner?: string;
  @IsOptional() @IsDateString() dispatchedAt?: string;
  @IsOptional() @IsDateString() expectedDeliveryDate?: string;
  @IsOptional() @IsString() note?: string;
}
export class UpdatePaymentDto {
  @IsEnum(PaymentStatus) paymentStatus: PaymentStatus;
  @IsOptional() @IsString() paymentMethod?: string;
  @IsOptional() @IsString() paymentProofUrl?: string;
  @IsOptional() @IsDateString() paymentReceivedAt?: string;
  @IsOptional() @IsString() paymentNotes?: string;
}
