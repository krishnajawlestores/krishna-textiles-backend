import { BadRequestException } from '@nestjs/common';

// Explicit scalar allowlists prevent nested Prisma writes and privilege-field injection.
export function validateFields(data: any, fields: string[]) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new BadRequestException('An object body is required.');
  for (const key of Object.keys(data)) {
    if (!fields.includes(key)) throw new BadRequestException(`Unexpected field: ${key}`);
  }
  for (const key of ['name', 'category', 'brand', 'brandId', 'categoryId', 'brandRefId', 'sku', 'slug', 'image', 'imageUrl', 'description']) {
    if (data[key] !== undefined && data[key] !== null && typeof data[key] !== 'string') throw new BadRequestException(`${key} must be a string.`);
  }
  for (const key of ['category', 'brand', 'brandId', 'sku']) {
    if (data[key] === null) throw new BadRequestException(`${key} must be a string.`);
  }
  for (const key of ['isActive', 'bestSeller']) {
    if (data[key] !== undefined && typeof data[key] !== 'boolean') throw new BadRequestException(`${key} must be a boolean.`);
  }
  for (const key of ['price', 'mrp', 'discount', 'stock', 'minStockAlert', 'sortOrder']) {
    if (data[key] !== undefined && (data[key] === null || data[key] === '' || !['string', 'number'].includes(typeof data[key]) || !Number.isFinite(Number(data[key])) || Number(data[key]) < 0)) {
      throw new BadRequestException(`${key} must be a non-negative number.`);
    }
  }
  for (const key of ['stock', 'minStockAlert', 'sortOrder']) {
    if (data[key] !== undefined && !Number.isInteger(Number(data[key]))) throw new BadRequestException(`${key} must be an integer.`);
  }
  for (const key of ['sizes', 'images', 'colors', 'sizeVariants']) {
    if (data[key] !== undefined && !Array.isArray(data[key])) throw new BadRequestException(`${key} must be an array.`);
  }
  for (const key of ['sizes', 'images']) {
    if (data[key]?.some((value: any) => typeof value !== 'string')) throw new BadRequestException(`${key} must contain strings.`);
  }
  if (data.sizeVariants !== undefined) {
    for (const variant of data.sizeVariants) {
      validateFields(variant, ['size', 'price', 'mrp', 'stock', 'sku']);
      if (typeof variant.size !== 'string' || !variant.size.trim()) throw new BadRequestException('Each variant requires a size.');
    }
  }
  if (data.name !== undefined && (typeof data.name !== 'string' || !data.name.trim())) throw new BadRequestException('name must not be empty.');
}

export const productFields = ['name', 'brand', 'brandId', 'brandRefId', 'category', 'categoryId', 'price', 'mrp', 'discount', 'sizes', 'stock', 'minStockAlert', 'description', 'sku', 'imageUrl', 'images', 'bestSeller', 'colors', 'sizeVariants', 'isActive'];
