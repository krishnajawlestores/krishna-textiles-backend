import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CouponType } from '@prisma/client';

@Injectable()
export class CouponsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query?: { search?: string; isActive?: string; page?: number; limit?: number }) {
    const page = Number(query?.page) || 1;
    const limit = Number(query?.limit) || 20;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (query?.search) {
      where.OR = [
        { code: { contains: query.search, mode: 'insensitive' } },
        { description: { contains: query.search, mode: 'insensitive' } },
      ];
    }
    if (query?.isActive !== undefined && query.isActive !== '') {
      where.isActive = query.isActive === 'true';
    }

    const [coupons, total] = await Promise.all([
      this.prisma.coupon.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.coupon.count({ where }),
    ]);

    return {
      data: coupons,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findOne(id: string) {
    const coupon = await this.prisma.coupon.findUnique({ where: { id } });
    if (!coupon) throw new NotFoundException(`Coupon '${id}' not found`);
    return coupon;
  }

  async validateCoupon(code: string, cartTotal: number) {
    const coupon = await this.prisma.coupon.findUnique({
      where: { code: code.toUpperCase() },
    });

    if (!coupon || !coupon.isActive) {
      throw new BadRequestException('Coupon is invalid or inactive');
    }

    const now = new Date();
    if (coupon.validFrom && now < coupon.validFrom) {
      throw new BadRequestException('Coupon has not started yet');
    }
    if (coupon.validUntil && now > coupon.validUntil) {
      throw new BadRequestException('Coupon has expired');
    }
    if (coupon.usageLimit && coupon.usedCount >= coupon.usageLimit) {
      throw new BadRequestException('Coupon usage limit reached');
    }
    if (cartTotal < coupon.minOrderAmount) {
      throw new BadRequestException(`Minimum order value of ₹${coupon.minOrderAmount} required`);
    }

    let discountAmount = 0;
    if (coupon.type === CouponType.PERCENTAGE) {
      discountAmount = (cartTotal * coupon.value) / 100;
      if (coupon.maxDiscountAmount && discountAmount > coupon.maxDiscountAmount) {
        discountAmount = coupon.maxDiscountAmount;
      }
    } else {
      discountAmount = Math.min(coupon.value, cartTotal);
    }

    return {
      valid: true,
      coupon,
      discountAmount: Math.round(discountAmount * 100) / 100,
      finalTotal: Math.max(0, cartTotal - discountAmount),
    };
  }

  async create(data: {
    code: string;
    description?: string;
    type?: CouponType;
    value: number;
    minOrderAmount?: number;
    maxDiscountAmount?: number;
    usageLimit?: number;
    validFrom?: string;
    validUntil?: string;
    applicableCategories?: string[];
    isActive?: boolean;
  }) {
    const code = data.code.trim().toUpperCase();
    const existing = await this.prisma.coupon.findUnique({ where: { code } });
    if (existing) throw new ConflictException(`Coupon code '${code}' already exists`);

    return this.prisma.coupon.create({
      data: {
        code,
        description: data.description || null,
        type: data.type || CouponType.PERCENTAGE,
        value: Number(data.value),
        minOrderAmount: data.minOrderAmount ? Number(data.minOrderAmount) : 0,
        maxDiscountAmount: data.maxDiscountAmount ? Number(data.maxDiscountAmount) : null,
        usageLimit: data.usageLimit ? Number(data.usageLimit) : null,
        validFrom: data.validFrom ? new Date(data.validFrom) : new Date(),
        validUntil: data.validUntil ? new Date(data.validUntil) : null,
        applicableCategories: data.applicableCategories || [],
        isActive: data.isActive !== undefined ? Boolean(data.isActive) : true,
      },
    });
  }

  async update(id: string, data: any) {
    const existing = await this.prisma.coupon.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Coupon '${id}' not found`);

    return this.prisma.coupon.update({
      where: { id },
      data: {
        code: data.code ? data.code.trim().toUpperCase() : existing.code,
        description: data.description ?? existing.description,
        type: data.type ?? existing.type,
        value: data.value !== undefined ? Number(data.value) : existing.value,
        minOrderAmount: data.minOrderAmount !== undefined ? Number(data.minOrderAmount) : existing.minOrderAmount,
        maxDiscountAmount: data.maxDiscountAmount !== undefined ? (data.maxDiscountAmount ? Number(data.maxDiscountAmount) : null) : existing.maxDiscountAmount,
        usageLimit: data.usageLimit !== undefined ? (data.usageLimit ? Number(data.usageLimit) : null) : existing.usageLimit,
        validFrom: data.validFrom !== undefined ? (data.validFrom ? new Date(data.validFrom) : new Date()) : existing.validFrom,
        validUntil: data.validUntil !== undefined ? (data.validUntil ? new Date(data.validUntil) : null) : existing.validUntil,
        applicableCategories: data.applicableCategories ?? existing.applicableCategories,
        isActive: data.isActive !== undefined ? Boolean(data.isActive) : existing.isActive,
      },
    });
  }

  async remove(id: string) {
    const existing = await this.prisma.coupon.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Coupon '${id}' not found`);
    await this.prisma.coupon.delete({ where: { id } });
    return { success: true, message: `Coupon '${existing.code}' deleted` };
  }
}
