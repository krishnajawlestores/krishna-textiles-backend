import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    return this.prisma.category.findMany({
      include: {
        _count: { select: { products: true } },
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  async findOne(id: string) {
    const cat = await this.prisma.category.findFirst({
      where: { OR: [{ id }, { slug: id }] },
      include: {
        _count: { select: { products: true } },
      },
    });
    if (!cat) throw new NotFoundException(`Category '${id}' not found`);
    return cat;
  }

  async create(data: { name: string; image?: string; description?: string; sortOrder?: number }) {
    const slug = data.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    const existing = await this.prisma.category.findFirst({ where: { OR: [{ name: data.name }, { slug }] } });
    if (existing) throw new BadRequestException(`Category '${data.name}' already exists`);

    return this.prisma.category.create({
      data: {
        name: data.name,
        slug,
        image: data.image || null,
        description: data.description || null,
        sortOrder: data.sortOrder || 0,
      },
    });
  }

  async update(id: string, data: any) {
    const existing = await this.prisma.category.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Category '${id}' not found`);

    return this.prisma.category.update({
      where: { id },
      data: {
        name: data.name ?? existing.name,
        image: data.image ?? existing.image,
        description: data.description ?? existing.description,
        sortOrder: data.sortOrder !== undefined ? Number(data.sortOrder) : existing.sortOrder,
        isActive: data.isActive !== undefined ? Boolean(data.isActive) : existing.isActive,
      },
    });
  }

  async remove(id: string) {
    const existing = await this.prisma.category.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Category '${id}' not found`);
    await this.prisma.category.delete({ where: { id } });
    return { success: true, message: `Category '${existing.name}' deleted` };
  }
}