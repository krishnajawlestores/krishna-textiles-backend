import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CustomCacheService } from '../cache/custom-cache.service';

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CustomCacheService,
  ) {}

  async findAll(params: {
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
  }) {
    const page = params.page ? Number(params.page) : 1;
    const limit = params.limit ? Number(params.limit) : 50;
    const skip = (page - 1) * limit;

    const andConditions: any[] = [];

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
    if (params.minPrice || params.maxPrice) {
      const priceFilter: any = {};
      if (params.minPrice) priceFilter.gte = Number(params.minPrice);
      if (params.maxPrice) priceFilter.lte = Number(params.maxPrice);
      andConditions.push({ price: priceFilter });
    }
    if (params.stockStatus && params.stockStatus !== 'all') {
      if (params.stockStatus === 'low' || params.stockStatus === 'low_stock') {
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
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
    ]);

    return {
      products,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findOne(id: string) {
    const cacheKey = `products:${id}`;
    const cached = await this.cache.get(cacheKey);
    if (cached) return cached;

    const product = await this.prisma.product.findFirst({
      where: {
        OR: [{ id }, { slug: id }, { sku: id }],
      },
      include: {
        categoryRef: true,
        brandRef: true,
      },
    });

    if (!product) throw new NotFoundException(`Product with ID '${id}' not found`);

    await this.cache.set(cacheKey, product, 300);
    return product;
  }

  async getCategories() {
    return this.prisma.category.findMany({
      include: {
        _count: { select: { products: true } },
      },
      orderBy: { name: 'asc' },
    });
  }

  async getBrands() {
    return this.prisma.brand.findMany({
      include: {
        _count: { select: { products: true } },
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
  }) {
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

    const product = await this.prisma.product.create({
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
      },
      include: {
        categoryRef: true,
        brandRef: true,
      },
    });

    await this.cache.invalidatePrefix('products:');
    await this.cache.invalidatePrefix('analytics:');
    await this.cache.invalidatePrefix('inventory:');

    return product;
  }

  async update(id: string, data: any) {
    const existing = await this.prisma.product.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Product with ID '${id}' not found`);

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

    const updated = await this.prisma.product.update({
      where: { id },
      data: updatePayload,
      include: {
        categoryRef: true,
        brandRef: true,
      },
    });

    await this.cache.invalidatePrefix('products:');
    await this.cache.invalidatePrefix('analytics:');
    await this.cache.invalidatePrefix('inventory:');

    return updated;
  }

  async remove(id: string) {
    const existing = await this.prisma.product.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Product with ID '${id}' not found`);

    await this.prisma.product.delete({ where: { id } });

    await this.cache.invalidatePrefix('products:');
    await this.cache.invalidatePrefix('analytics:');
    await this.cache.invalidatePrefix('inventory:');

    return { success: true, message: `Product ${existing.name} deleted` };
  }
}
