import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CustomCacheService } from '../cache/custom-cache.service';

export interface StoreSettingsDto {
  companyName?: string;
  companyTagline?: string;
  companyAddress?: string;
  companyCity?: string;
  companyState?: string;
  companyPincode?: string;
  companyPhone?: string;
  companyEmail?: string;
  companyGstin?: string;
  companyPan?: string;
  companyWebsite?: string;
  gstRate?: number;
  defaultDiscountRate?: number;
  minOrderValue?: number;
  freeShippingThreshold?: number;
}

@Injectable()
export class SettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CustomCacheService,
  ) {}

  async getSettings() {
    const cacheKey = 'store:settings';
    const cached = await this.cache.get(cacheKey);
    if (cached) return cached;

    let settings = await this.prisma.storeSetting.findUnique({
      where: { id: 'default' },
    });

    if (!settings) {
      settings = await this.prisma.storeSetting.create({
        data: {
          id: 'default',
          companyName: 'Krishna Jawli Stores Pvt Ltd',
          companyTagline: 'Leading Textile Manufacturers & Hosiery Wholesalers',
          companyAddress: '88/4, Tiruppur Main Textile Complex',
          companyCity: 'Tiruppur',
          companyState: 'Tamil Nadu - 641604',
          companyPincode: '641604',
          companyPhone: '+91 421 249 8899',
          companyEmail: 'billing@krishnatextiles.com',
          companyGstin: '33AAACK9911D1ZX',
          companyPan: 'AAACK9911D',
          companyWebsite: 'www.krishnatextiles.com',
          gstRate: 5.0,
          defaultDiscountRate: 5.0,
          minOrderValue: 2999.0,
          freeShippingThreshold: 999.0,
        },
      });
    }

    await this.cache.set(cacheKey, settings, 300);
    return settings;
  }

  async updateSettings(data: StoreSettingsDto) {
    const updateData: any = {};

    if (data.companyName !== undefined) updateData.companyName = String(data.companyName).trim();
    if (data.companyTagline !== undefined) updateData.companyTagline = String(data.companyTagline).trim();
    if (data.companyAddress !== undefined) updateData.companyAddress = String(data.companyAddress).trim();
    if (data.companyCity !== undefined) updateData.companyCity = String(data.companyCity).trim();
    if (data.companyState !== undefined) updateData.companyState = String(data.companyState).trim();
    if (data.companyPincode !== undefined) updateData.companyPincode = String(data.companyPincode).trim();
    if (data.companyPhone !== undefined) updateData.companyPhone = String(data.companyPhone).trim();
    if (data.companyEmail !== undefined) updateData.companyEmail = String(data.companyEmail).trim();
    if (data.companyGstin !== undefined) updateData.companyGstin = String(data.companyGstin).trim();
    if (data.companyPan !== undefined) updateData.companyPan = String(data.companyPan).trim();
    if (data.companyWebsite !== undefined) updateData.companyWebsite = String(data.companyWebsite).trim();

    if (data.gstRate !== undefined) updateData.gstRate = Number(data.gstRate);
    if (data.defaultDiscountRate !== undefined) updateData.defaultDiscountRate = Number(data.defaultDiscountRate);
    if (data.minOrderValue !== undefined) updateData.minOrderValue = Number(data.minOrderValue);
    if (data.freeShippingThreshold !== undefined) updateData.freeShippingThreshold = Number(data.freeShippingThreshold);

    const updated = await this.prisma.storeSetting.upsert({
      where: { id: 'default' },
      update: updateData,
      create: {
        id: 'default',
        ...updateData,
      },
    });

    await this.cache.delete('store:settings');
    return updated;
  }
}
