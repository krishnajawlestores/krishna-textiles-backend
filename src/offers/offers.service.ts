import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OfferTarget, CouponType } from '@prisma/client';

@Injectable()
export class OffersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query?: { isActive?: string; targetType?: OfferTarget }, admin = false) {
    const where: any = admin ? {} : { isActive: true };
    if (admin && query?.isActive !== undefined && query.isActive !== '') {
      where.isActive = query.isActive === 'true';
    }
    if (query?.targetType) {
      where.targetType = query.targetType;
    }

    return this.prisma.offer.findMany({
      where,
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async findOne(id: string, admin = false) {
    const offer = await this.prisma.offer.findFirst({ where: { id, ...(admin ? {} : { isActive: true }) } });
    if (!offer) throw new NotFoundException(`Offer '${id}' not found`);
    return offer;
  }

  async create(data: {
    title: string;
    description?: string;
    bannerImage?: string;
    discountType?: CouponType;
    discountValue: number;
    targetType?: OfferTarget;
    targetId?: string;
    targetName?: string;
    startDate?: string;
    endDate?: string;
    priority?: number;
    badgeText?: string;
    isActive?: boolean;
  }) {
    return this.prisma.offer.create({
      data: {
        title: data.title,
        description: data.description || null,
        bannerImage: data.bannerImage || null,
        discountType: data.discountType || CouponType.PERCENTAGE,
        discountValue: Number(data.discountValue) || 0,
        targetType: data.targetType || OfferTarget.ALL,
        targetId: data.targetId || null,
        targetName: data.targetName || null,
        startDate: data.startDate ? new Date(data.startDate) : new Date(),
        endDate: data.endDate ? new Date(data.endDate) : null,
        priority: data.priority !== undefined ? Number(data.priority) : 0,
        badgeText: data.badgeText || null,
        isActive: data.isActive !== undefined ? Boolean(data.isActive) : true,
      },
    });
  }

  async update(id: string, data: any) {
    const existing = await this.prisma.offer.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Offer '${id}' not found`);

    return this.prisma.offer.update({
      where: { id },
      data: {
        title: data.title ?? existing.title,
        description: data.description ?? existing.description,
        bannerImage: data.bannerImage ?? existing.bannerImage,
        discountType: data.discountType ?? existing.discountType,
        discountValue: data.discountValue !== undefined ? Number(data.discountValue) : existing.discountValue,
        targetType: data.targetType ?? existing.targetType,
        targetId: data.targetId ?? existing.targetId,
        targetName: data.targetName ?? existing.targetName,
        startDate: data.startDate ? new Date(data.startDate) : existing.startDate,
        endDate: data.endDate !== undefined ? (data.endDate ? new Date(data.endDate) : null) : existing.endDate,
        priority: data.priority !== undefined ? Number(data.priority) : existing.priority,
        badgeText: data.badgeText ?? existing.badgeText,
        isActive: data.isActive !== undefined ? Boolean(data.isActive) : existing.isActive,
      },
    });
  }

  async remove(id: string) {
    const existing = await this.prisma.offer.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Offer '${id}' not found`);
    await this.prisma.offer.delete({ where: { id } });
    return { success: true, message: `Offer '${existing.title}' deleted` };
  }
}
