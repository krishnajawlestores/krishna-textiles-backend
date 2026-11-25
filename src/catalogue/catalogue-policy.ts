import { BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CustomCacheService } from '../cache/custom-cache.service';

export const publicProductWhere: Prisma.ProductWhereInput = {
  isActive: true,
  AND: [
    { OR: [{ categoryId: null }, { categoryRef: { isActive: true } }] },
    { OR: [{ brandRefId: null }, { brandRef: { isActive: true } }] },
  ],
};

export function activeFilter(value?: string): boolean | undefined {
  if (value === undefined || value === 'all') return undefined;
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new BadRequestException('isActive must be true, false or all.');
}

// Every catalogue mutation participates in the same serializable dependency policy.
export async function catalogueWrite<T>(prisma: PrismaService, cache: CustomCacheService,
  operation: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  let result: T;
  try {
    result = await prisma.$transaction(operation, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    if (error?.code === 'P2034') throw new ConflictException('Catalogue changed concurrently. Please retry.');
    if (error?.code === 'P2002') throw new ConflictException('A catalogue record with these unique values already exists.');
    if (error?.code === 'P2003') throw new ConflictException('A related catalogue record is not usable.');
    throw error;
  }
  for (const prefix of ['products:', 'categories:', 'brands:', 'analytics:', 'inventory:']) {
    await cache.invalidatePrefix(prefix);
  }
  return result;
}

export async function validateProductReferences(tx: Prisma.TransactionClient, data: {
  categoryId?: string; brandRefId?: string; category?: string; brand?: string; brandId?: string;
}) {
  const category = data.categoryId
    ? await tx.category.findUnique({ where: { id: data.categoryId } })
    : data.category ? await tx.category.findFirst({ where: { OR: [
        { id: data.category }, { slug: { equals: data.category, mode: 'insensitive' } },
        { name: { equals: data.category, mode: 'insensitive' } },
      ] } }) : null;
  const brand = data.brandRefId
    ? await tx.brand.findUnique({ where: { id: data.brandRefId } })
    : await tx.brand.findFirst({ where: { OR: [
        ...(data.brandId ? [{ id: data.brandId }, { slug: { equals: data.brandId, mode: 'insensitive' as const } }] : []),
        ...(data.brand ? [{ name: { equals: data.brand, mode: 'insensitive' as const } }] : []),
      ] } });
  if ((data.categoryId && !category) || (category && !category.isActive)) throw new ConflictException('Product requires an active category.');
  if ((data.brandRefId && !brand) || (brand && !brand.isActive)) throw new ConflictException('Product requires an active brand.');
}

// Older products may use category/brand text without a foreign-key reference.
export async function publicProductFilter(prisma: PrismaService): Promise<Prisma.ProductWhereInput> {
  const [categories, brands] = await Promise.all([
    prisma.category.findMany({ where: { isActive: false }, select: { id: true, slug: true, name: true } }),
    prisma.brand.findMany({ where: { isActive: false }, select: { id: true, slug: true, name: true } }),
  ]);
  return { AND: [publicProductWhere,
    ...(categories.length ? [{ NOT: { categoryId: null, category: { in: categories.flatMap(c => [c.id, c.slug, c.name]), mode: 'insensitive' as const } } }] : []),
    ...(brands.length ? [{ NOT: { brandRefId: null, OR: [
      { brandId: { in: brands.flatMap(b => [b.id, b.slug]), mode: 'insensitive' as const } },
      { brand: { in: brands.map(b => b.name), mode: 'insensitive' as const } },
    ] } }] : []),
  ] };
}
