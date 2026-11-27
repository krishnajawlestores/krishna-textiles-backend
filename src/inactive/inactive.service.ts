import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CustomCacheService } from '../cache/custom-cache.service';
import { CmsService } from '../cms/cms.service';
import { catalogueWrite, validateProductReferences } from '../catalogue/catalogue-policy';
import { ActivateInactiveDto, InactiveQueryDto } from './inactive.dto';

@Injectable()
export class InactiveService {
  constructor(private readonly prisma: PrismaService, private readonly cache: CustomCacheService, private readonly cms: CmsService) {}

  private model(type: string) {
    const models = { products: 'product', categories: 'category', brands: 'brand', orders: 'order', stocks: 'product', cms: 'cms' };
    if (!Object.prototype.hasOwnProperty.call(models, type)) throw new BadRequestException('Unknown inactive record type.');
    return models[type];
  }

  private where(type: string, query: InactiveQueryDto) {
    const fields = type === 'orders' ? ['orderNumber', 'customerName', 'customerPhone'] :
      ['products', 'stocks'].includes(type) ? ['name', 'sku', 'category', 'brand'] : ['name', 'slug'];
    return {
      isActive: false,
      ...(query.search?.trim() ? { OR: fields.map(field => ({ [field]: { contains: query.search.trim(), mode: 'insensitive' } })) } : {}),
      ...(['products', 'stocks'].includes(type) && query.stock && query.stock !== 'all' ? { stock: query.stock === 'out' ? { lte: 0 } : { gt: 0 } } : {}),
    };
  }

  private async cmsRows(query: InactiveQueryDto) {
    const [banners, pages, announcement] = await Promise.all([this.cms.getAllBanners(true), this.cms.getAllPages(true), this.cms.getAnnouncement(true)]);
    return [
      ...banners.filter(b => !b.isActive).map(b => ({ id: `banner:${b.id}`, sourceId: b.id, kind: 'banner', name: b.title, detail: b.linkUrl, updatedAt: b.updatedAt })),
      ...pages.filter(p => !p.isPublished).map(p => ({ id: `page:${p.id}`, sourceId: p.id, kind: 'page', name: p.title, detail: p.slug, updatedAt: p.updatedAt })),
      ...(announcement && !announcement.isActive ? [{ id: `announcement:${announcement.id}`, sourceId: announcement.id, kind: 'announcement', name: announcement.text, detail: announcement.linkUrl, updatedAt: announcement.updatedAt }] : []),
    ].filter(row => (!query.cmsType || query.cmsType === 'all' || row.kind === query.cmsType) &&
      (!query.search?.trim() || `${row.name} ${row.detail || ''}`.toLowerCase().includes(query.search.trim().toLowerCase())))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id));
  }

  async list(type: string, query: InactiveQueryDto) {
    const model = this.model(type);
    const limit = query.limit || 10;
    if (model === 'cms') {
      const rows = await this.cmsRows(query);
      const totalPages = Math.max(1, Math.ceil(rows.length / limit));
      const page = Math.min(query.page || 1, totalPages);
      return { data: rows.slice((page - 1) * limit, page * limit), total: rows.length, page, totalPages };
    }
    const where = this.where(type, query);
    const delegate = (this.prisma as any)[model];
    const total = await delegate.count({ where });
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const page = Math.min(query.page || 1, totalPages);
    const select = type === 'orders'
      ? { id: true, orderNumber: true, customerName: true, status: true, updatedAt: true }
      : ['products', 'stocks'].includes(type)
        ? { id: true, name: true, sku: true, stock: true, category: true, brand: true, updatedAt: true }
        : { id: true, name: true, slug: true, updatedAt: true };
    const rows = await delegate.findMany({ where, select, orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }], skip: (page - 1) * limit, take: limit });
    return { data: rows.map(row => ({ ...row, name: row.name || row.orderNumber, detail: row.sku || row.slug || row.customerName })), total, page, totalPages };
  }

  async activate(type: string, body: ActivateInactiveDto) {
    const model = this.model(type);
    if (body.all === true ? body.ids !== undefined : !body.ids?.length) {
      throw new BadRequestException('Provide either ids or all: true.');
    }
    if (model === 'cms') {
      const rows = (await this.cmsRows(body)).filter(row => body.all || body.ids.includes(row.id));
      return this.cms.activateInactiveRecords(rows);
    }
    const where = { ...this.where(type, body), ...(body.all ? {} : { id: { in: body.ids } }) };
    const result = await catalogueWrite(this.prisma, this.cache, async tx => {
      if (model === 'product') {
        const products = await tx.product.findMany({ where });
        for (const product of products) await validateProductReferences(tx, product);
      }
      return (tx as any)[model].updateMany({ where, data: { isActive: true } }) as Promise<{ count: number }>;
    });
    await this.cache.invalidatePrefix('orders:');
    return result;
  }
}
