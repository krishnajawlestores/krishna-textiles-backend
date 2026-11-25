import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CustomCacheService } from '../cache/custom-cache.service';
import { catalogueWrite, publicProductFilter } from '../catalogue/catalogue-policy';
import { validateFields } from '../catalogue/validation';

@Injectable()
export class BrandsService {
  constructor(private readonly prisma: PrismaService, private readonly cache: CustomCacheService) {}

  async findAll(admin = false, isActive?: boolean) {
    return this.prisma.brand.findMany({
      where: admin ? { isActive } : { isActive: true },
      include: { _count: { select: { products: { where: admin ? {} : await publicProductFilter(this.prisma) } } } },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string, admin = false) {
    const record = await this.prisma.brand.findFirst({
      where: { OR: [{ id }, { slug: id }], ...(admin ? {} : { isActive: true }) },
      include: { _count: { select: { products: { where: admin ? {} : await publicProductFilter(this.prisma) } } } },
    });
    if (!record) throw new NotFoundException('Brand not found.');
    return record;
  }

  async create(data: any) {
    validateFields(data, ['name', 'image', 'description', 'isActive']);
    if (!data.name?.trim()) throw new BadRequestException('name is required.');
    const slug = data.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    return catalogueWrite(this.prisma, this.cache, tx => tx.brand.create({ data: {
      name: data.name, slug, image: data.image || null, description: data.description || null,
      isActive: data.isActive ?? true,
    } }));
  }

  async update(id: string, data: any) {
    validateFields(data, ['name', 'image', 'description', 'isActive']);
    return catalogueWrite(this.prisma, this.cache, async tx => {
      const existing = await tx.brand.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException('Brand not found.');
      if (data.isActive === false) await this.checkDependencies(tx, existing);
      return tx.brand.update({ where: { id }, data: { ...data } });
    });
  }

  private async checkDependencies(tx: any, record: any) {
    const dependencies = await tx.product.count({ where: {
      isActive: true,
      OR: [{ brandRefId: record.id }, { brandRefId: null, OR: [{ brandId: { in: [record.id, record.slug], mode: 'insensitive' } }, { brand: { equals: record.name, mode: 'insensitive' } }] }],
    } });
    if (dependencies) throw new ConflictException('Archive or reassign active products before archiving this brand.');
  }

  async remove(id: string) {
    const record = await this.update(id, { isActive: false });
    return { success: true, message: `Brand '${record.name}' archived` };
  }

  async restore(id: string) {
    return this.update(id, { isActive: true });
  }
}
