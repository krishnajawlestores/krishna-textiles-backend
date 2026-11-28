import { catalogueWrite, publicProductFilter, validateProductReferences } from '../catalogue/catalogue-policy';
import { validateFields, productFields } from '../catalogue/validation';
import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CustomCacheService } from '../cache/custom-cache.service';

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CustomCacheService,
  ) {}

  async findAll(params: {
    isActive?: boolean;
    category?: string;
    brandId?: string;
    categoryId?: string;
    brandRefId?: string;
    search?: string;
    minPrice?: number;
    maxPrice?: number;
    stockStatus?: string;
    page?: number;
    limit?: number;
    sort?: string;
    brandIds?: string;
    categoryIds?: string;
    minRating?: number;
    minDiscount?: number;
    dealsOnly?: string;
    includeFacets?: string;
  }, admin = false) {
    for (const key of ['category', 'brandId', 'categoryId', 'brandRefId', 'search', 'stockStatus']) {
      if (params[key] !== undefined && typeof params[key] !== 'string') throw new BadRequestException(`${key} must be a string.`);
    }
    for (const key of ['minPrice', 'maxPrice', 'minRating', 'minDiscount']) {
      if (params[key] !== undefined && (!Number.isFinite(Number(params[key])) || Number(params[key]) < 0)) throw new BadRequestException(`${key} must be a non-negative number.`);
    }
    for (const key of ['brandIds', 'categoryIds']) {
      if (params[key] !== undefined && (typeof params[key] !== 'string' || params[key].length > 4000 || params[key].split(',').length > 100)) throw new BadRequestException(`Invalid ${key}.`);
    }
    for (const key of ['dealsOnly', 'includeFacets']) {
      if (params[key] !== undefined && !['true', 'false'].includes(params[key])) throw new BadRequestException(`Invalid ${key}.`);
    }
    const sorting = { popular: { reviews: 'desc' }, 'price-low': { price: 'asc' }, 'price-high': { price: 'desc' }, rating: { rating: 'desc' }, discount: { discount: 'desc' }, newest: { createdAt: 'desc' } };
    if (params.sort !== undefined && !Object.prototype.hasOwnProperty.call(sorting, params.sort)) throw new BadRequestException('Invalid sort option.');
    const page = params.page ? Number(params.page) : 1;
    const limit = params.limit ? Number(params.limit) : 50;
    if (!Number.isInteger(page) || page < 1 || !Number.isInteger(limit) || limit < 1 || limit > 200) throw new BadRequestException('Invalid pagination (limit 1-200).');
    const skip = (page - 1) * limit;

    const andConditions: any[] = admin ? [{ isActive: params.isActive }] : [await publicProductFilter(this.prisma)];

    if (params.category && params.category !== 'all') {
      andConditions.push({
        OR: [
          { category: { equals: params.category, mode: 'insensitive' } },
          { categoryId: params.category },
          { categoryRef: { slug: params.category } },
          { categoryRef: { name: { equals: params.category, mode: 'insensitive' } } },
        ],
      });
    }
    if (params.categoryId && params.categoryId !== 'all') {
      andConditions.push({
        OR: [
          { categoryId: params.categoryId },
          { categoryRef: { slug: params.categoryId } },
        ],
      });
    }
    if (params.brandId && params.brandId !== 'all') {
      andConditions.push({
        OR: [
          { brandId: params.brandId },
          { brandRefId: params.brandId },
          { brand: { equals: params.brandId, mode: 'insensitive' } },
          { brandRef: { slug: params.brandId } },
          { brandRef: { name: { equals: params.brandId, mode: 'insensitive' } } },
        ],
      });
    }
    if (params.brandRefId && params.brandRefId !== 'all') {
      andConditions.push({
        OR: [
          { brandRefId: params.brandRefId },
          { brandRef: { slug: params.brandRefId } },
        ],
      });
    }
    if (params.search && params.search.trim()) {
      const q = params.search.trim();
      andConditions.push({
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { brand: { contains: q, mode: 'insensitive' } },
          { sku: { contains: q, mode: 'insensitive' } },
          { description: { contains: q, mode: 'insensitive' } },
        ],
      });
    }
    const facetWhere = { AND: [...andConditions] };
    for (const [key, relation, legacy] of [['brandIds', 'brandRef', 'brand'], ['categoryIds', 'categoryRef', 'category']]) {
      if (params[key]) {
        const ids = params[key].split(',').filter(Boolean);
        const records = key === 'brandIds'
          ? await this.prisma.brand.findMany({ where: { id: { in: ids } }, select: { id: true, slug: true, name: true } })
          : await this.prisma.category.findMany({ where: { id: { in: ids } }, select: { id: true, slug: true, name: true } });
        andConditions.push({ OR: [
          { [relation]: { id: { in: ids } } },
          { [legacy]: { in: records.flatMap(r => [r.id, r.slug, r.name]), mode: 'insensitive' } },
          ...(key === 'brandIds' ? [{ brandId: { in: records.flatMap(r => [r.id, r.slug]) } }] : []),
        ] });
      }
    }
    if (Number(params.minRating) > 0) andConditions.push({ rating: { gte: Number(params.minRating) } });
    if (Number(params.minDiscount) > 0) andConditions.push({ discount: { gte: Number(params.minDiscount) } });
    if (params.dealsOnly === 'true') andConditions.push({ OR: [{ discount: { gt: 0 } }, { mrp: { gt: this.prisma.product.fields.price } }] });
    if (params.minPrice !== undefined || params.maxPrice !== undefined) {
      const priceFilter: any = {};
      if (params.minPrice !== undefined) priceFilter.gte = Number(params.minPrice);
      if (params.maxPrice !== undefined) priceFilter.lte = Number(params.maxPrice);
      andConditions.push({ price: priceFilter });
    }
    if (params.stockStatus && params.stockStatus !== 'all') {
      if (params.stockStatus === 'in') {
        andConditions.push({ stock: { gt: 0 } });
      } else if (params.stockStatus === 'low' || params.stockStatus === 'low_stock') {
        andConditions.push({ stock: { gt: 0, lt: 20 } });
      } else if (params.stockStatus === 'medium' || params.stockStatus === 'medium_stock') {
        andConditions.push({ stock: { equals: 20 } });
      } else if (params.stockStatus === 'high' || params.stockStatus === 'high_stock') {
        andConditions.push({ stock: { gt: 20 } });
      } else if (params.stockStatus === 'out_of_stock' || params.stockStatus === 'out') {
        andConditions.push({ stock: { lte: 0 } });
      }
    }

    const where: any = andConditions.length > 0 ? { AND: andConditions } : {};

    const [total, products] = await Promise.all([
      this.prisma.product.count({ where }),
      this.prisma.product.findMany({
        where,
        include: {
          categoryRef: true,
          brandRef: true,
        },
        orderBy: [sorting[params.sort || 'newest'], { id: 'asc' }],
        skip,
        take: limit,
      }),
    ]);

    return {
      products,
      maxPrice: params.includeFacets === 'true' ? (await this.prisma.product.aggregate({ where: facetWhere, _max: { price: true } }))._max.price || 0 : undefined,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findOne(id: string, admin = false) {
    const product = await this.prisma.product.findFirst({
      where: {
        AND: [admin ? {} : await publicProductFilter(this.prisma), { OR: [{ id }, { slug: id }, { sku: id }] }],
      },
      include: {
        categoryRef: true,
        brandRef: true,
      },
    });

    if (!product) throw new NotFoundException(`Product with ID '${id}' not found`);

    return product;
  }

  async getCategories() {
    return this.prisma.category.findMany({
      where: { isActive: true },
      include: {
        _count: { select: { products: { where: await publicProductFilter(this.prisma) } } },
      },
      orderBy: { name: 'asc' },
    });
  }

  async getBrands() {
    return this.prisma.brand.findMany({
      where: { isActive: true },
      include: {
        _count: { select: { products: { where: await publicProductFilter(this.prisma) } } },
      },
      orderBy: { name: 'asc' },
    });
  }

  async create(data: {
    name: string;
    brand?: string;
    brandId?: string;
    brandRefId?: string;
    category: string;
    categoryId?: string;
    price: number;
    mrp: number;
    discount?: number;
    sizes?: string[];
    stock?: number;
    minStockAlert?: number;
    description?: string;
    sku?: string;
    imageUrl?: string;
    images?: string[];
    bestSeller?: boolean;
    isActive?: boolean;
  }) {
    validateFields(data, productFields);
    if (!data.name?.trim() || !data.category?.trim()) throw new BadRequestException('name and category are required.');
    return catalogueWrite(this.prisma, this.cache, async tx => {
      if (data.isActive !== false) await validateProductReferences(tx, data);
      const slug = `${Date.now()}-${data.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')}`;
      const brandName = (data.brand || '').trim();
      const brandIdVal = data.brandId
        ? data.brandId.toLowerCase()
        : (brandName ? brandName.toLowerCase().replace(/[^a-z0-9]/g, '-') : '');
      const brandCode = (brandIdVal || brandName || 'KT').toUpperCase().slice(0, 3) || 'KT';
      const sku = data.sku || `KT-${brandCode}-${Math.floor(1000 + Math.random() * 9000)}`;
      const images = Array.isArray(data.images) ? data.images.slice(0, 5) : [];
      const colorImages = Array.isArray((data as any).colors)
        ? (data as any).colors.map((c: any) => c?.image).filter(Boolean)
        : [];
      const allImages = [...images];
      for (const cImg of colorImages) {
        if (!allImages.includes(cImg) && allImages.length < 5) {
          allImages.push(cImg);
        }
      }
      const primaryImage = allImages[0] || data.imageUrl || 'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?w=500';

      const sizeVariants = Array.isArray((data as any).sizeVariants) ? (data as any).sizeVariants : [];
      let initialPrice = Number(data.price) || 0;
      let initialMrp = Number(data.mrp) || initialPrice;
      let initialStock = Number(data.stock) || 0;
      let initialSizes = data.sizes || ['Free Size'];

      if (sizeVariants.length > 0) {
        initialSizes = sizeVariants.map((v: any) => v.size).filter(Boolean);
        if (!initialPrice || initialPrice <= 0) {
          initialPrice = Number(sizeVariants[0].price) || 0;
        }
        if (!initialMrp || initialMrp <= 0) {
          initialMrp = Number(sizeVariants[0].mrp) || initialPrice;
        }
        initialStock = sizeVariants.reduce((acc: number, v: any) => acc + (Number(v.stock) || 0), 0);
      }

      const product = await tx.product.create({
        data: {
          name: data.name,
          slug,
          brand: brandName,
          brandId: brandIdVal,
          brandRefId: data.brandRefId || null,
          category: data.category.toLowerCase(),
          categoryId: data.categoryId || null,
          price: initialPrice,
          mrp: initialMrp,
          discount: Number(data.discount) || Math.round(((initialMrp - initialPrice) / (initialMrp || 1)) * 100),
          sizes: initialSizes,
          sizeVariants: sizeVariants,
          stock: initialStock,
          minStockAlert: Number(data.minStockAlert) || 20,
          description: data.description || null,
          sku,
          imageUrl: primaryImage,
          images: allImages.length > 0 ? allImages : [primaryImage],
          colors: (data as any).colors || [],
          bestSeller: Boolean(data.bestSeller),
          isActive: data.isActive ?? true,
        },
        include: {
          categoryRef: true,
          brandRef: true,
        },
    });

    return product;
    });
  }

  async update(id: string, data: any) {
    validateFields(data, productFields);
    return catalogueWrite(this.prisma, this.cache, async tx => {
      const existing = await tx.product.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException(`Product with ID '${id}' not found`);

      if (data.isActive ?? existing.isActive) await validateProductReferences(tx, { ...existing, ...data });
      const updatePayload: any = { ...data };
      if (data.price !== undefined) updatePayload.price = Number(data.price);
      if (data.mrp !== undefined) updatePayload.mrp = Number(data.mrp);
      if (data.stock !== undefined) updatePayload.stock = Number(data.stock);
      if (data.minStockAlert !== undefined) updatePayload.minStockAlert = Number(data.minStockAlert);
      if (data.discount !== undefined) updatePayload.discount = Number(data.discount);
      if (data.bestSeller !== undefined) updatePayload.bestSeller = Boolean(data.bestSeller);
      if (data.brandRefId !== undefined) updatePayload.brandRefId = data.brandRefId || null;
      if (data.brand !== undefined) updatePayload.brand = (data.brand || '').trim();
      if (data.colors !== undefined) updatePayload.colors = data.colors;
      if (data.sizeVariants !== undefined) {
        const variants = Array.isArray(data.sizeVariants) ? data.sizeVariants : [];
        updatePayload.sizeVariants = variants;
        if (variants.length > 0) {
          updatePayload.sizes = variants.map((v: any) => v.size).filter(Boolean);
          if (data.stock === undefined) {
            updatePayload.stock = variants.reduce((acc: number, v: any) => acc + (Number(v.stock) || 0), 0);
          }
          if (data.price === undefined && variants[0]?.price) {
            updatePayload.price = Number(variants[0].price);
          }
        }
      }
      if (data.brandId !== undefined) {
        updatePayload.brandId = data.brandId ? data.brandId.toLowerCase() : '';
      }
      if (data.images !== undefined && Array.isArray(data.images)) {
        const images = data.images.slice(0, 5);
        updatePayload.images = images;
        if (images.length > 0) {
          updatePayload.imageUrl = images[0];
        }
      }

      const updated = await tx.product.update({
        where: { id },
        data: updatePayload,
        include: {
          categoryRef: true,
          brandRef: true,
        },
    });

    return updated;
    });
  }

  async remove(id: string) {
    const product = await catalogueWrite(this.prisma, this.cache, async tx => {
      const existing = await tx.product.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException('Product not found.');
      return tx.product.update({ where: { id }, data: { isActive: false } });
    });
    return { success: true, message: `Product ${product.name} archived` };
  }

  async restore(id: string) {
    return this.update(id, { isActive: true });
  }
}
