import { validateFields } from '../catalogue/validation';
import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CustomCacheService } from '../cache/custom-cache.service';
import { CustomerType } from '@prisma/client';

@Injectable()
export class CrmService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CustomCacheService,
  ) {}

  async findAll(params: { type?: CustomerType; search?: string }) {
    const where: any = {};
    if (params.type && params.type !== ('ALL' as any)) {
      where.type = params.type;
    }
    if (params.search) {
      where.OR = [
        { name: { contains: params.search, mode: 'insensitive' } },
        { phone: { contains: params.search, mode: 'insensitive' } },
        { email: { contains: params.search, mode: 'insensitive' } },
        { company: { contains: params.search, mode: 'insensitive' } },
        { gstin: { contains: params.search, mode: 'insensitive' } },
      ];
    }

    // Ensure all ordered customers exist as customer records
    const orphanOrders = await this.prisma.order.findMany({
      where: { customerId: null },
    });
    for (const o of orphanOrders) {
      if (o.customerPhone) {
        let customer = await this.prisma.customer.findUnique({
          where: { phone: o.customerPhone },
        });
        if (!customer) {
          customer = await this.prisma.customer.create({
            data: {
              name: o.customerName || 'Customer',
              phone: o.customerPhone,
              email: o.customerEmail || null,
              address: o.shippingAddress || null,
              type: 'RETAIL',
            },
          });
        }
        await this.prisma.order.update({
          where: { id: o.id },
          data: { customerId: customer.id },
        });
      }
    }

    const customers = await this.prisma.customer.findMany({
      where,
      include: {
        _count: { select: { orders: true, notes: true } },
        orders: {
          select: { totalAmount: true, createdAt: true, status: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Calculate customer metrics
    return customers.map((c) => {
      const deliveredOrders = c.orders.filter((o) => o.status !== 'CANCELLED');
      const totalSpent = deliveredOrders.reduce((sum, o) => sum + o.totalAmount, 0);
      const avgOrderValue = deliveredOrders.length > 0 ? Math.round(totalSpent / deliveredOrders.length) : 0;
      const lastOrder = c.orders.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];

      return {
        id: c.id,
        name: c.name,
        email: c.email,
        phone: c.phone,
        company: c.company,
        gstin: c.gstin,
        address: c.address,
        city: c.city,
        state: c.state,
        pincode: c.pincode,
        type: c.type,
        creditLimit: c.creditLimit,
        totalOrders: c._count.orders,
        orderCount: c._count.orders,
        totalSpent,
        totalSpend: totalSpent,
        avgOrderValue,
        lastOrderDate: lastOrder ? lastOrder.createdAt : null,
        createdAt: c.createdAt,
      };
    });
  }

  async findOne(id: string) {
    const customer = await this.prisma.customer.findUnique({
      where: { id },
      include: {
        notes: { orderBy: { createdAt: 'desc' } },
        orders: {
          orderBy: { createdAt: 'desc' },
          include: { items: true },
        },
      },
    });

    if (!customer) throw new NotFoundException(`Customer '${id}' not found`);

    const validOrders = customer.orders.filter((o) => o.status !== 'CANCELLED');
    const totalSpent = validOrders.reduce((acc, o) => acc + o.totalAmount, 0);

    return {
      ...customer,
      metrics: {
        totalOrders: customer.orders.length,
        totalSpent,
        avgOrderValue: validOrders.length > 0 ? Math.round(totalSpent / validOrders.length) : 0,
      },
    };
  }

  async create(data: {
    name: string;
    phone: string;
    email?: string;
    company?: string;
    gstin?: string;
    address?: string;
    city?: string;
    state?: string;
    pincode?: string;
    type?: CustomerType;
    creditLimit?: number;
    initialNote?: string;
  }) {
    const existing = await this.prisma.customer.findUnique({
      where: { phone: data.phone },
    });
    if (existing) {
      throw new ConflictException('Customer with this phone already exists.');
    }

    const customer = await this.prisma.customer.create({
      data: {
        name: data.name,
        phone: data.phone,
        email: data.email || null,
        company: data.company || null,
        gstin: data.gstin || null,
        address: data.address || null,
        city: data.city || null,
        state: data.state || null,
        pincode: data.pincode || null,
        type: data.type || CustomerType.RETAIL,
        creditLimit: Number(data.creditLimit) || 0,
        notes: data.initialNote
          ? {
              create: {
                note: data.initialNote,
                author: 'Admin',
              },
            }
          : undefined,
      },
    });

    await this.cache.invalidatePrefix('analytics:');
    return customer;
  }

  async update(id: string, data: any) {
    validateFields(data, ['name', 'phone', 'email', 'company', 'gstin', 'address', 'city', 'state', 'pincode', 'type', 'creditLimit']);
    const existing = await this.prisma.customer.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Customer '${id}' not found`);

    return this.prisma.customer.update({
      where: { id },
      data: {
        ...data,
        creditLimit: data.creditLimit !== undefined ? Number(data.creditLimit) : undefined,
      },
    });
  }

  async addNote(customerId: string, note: string, author = 'Admin') {
    const customer = await this.prisma.customer.findUnique({ where: { id: customerId } });
    if (!customer) throw new NotFoundException(`Customer '${customerId}' not found`);

    return this.prisma.customerNote.create({
      data: {
        customerId,
        note,
        author,
      },
    });
  }

  async getCrmStats() {
    const [total, wholesaleCount, vipCount, retailCount] = await Promise.all([
      this.prisma.customer.count(),
      this.prisma.customer.count({ where: { type: CustomerType.WHOLESALE } }),
      this.prisma.customer.count({ where: { type: CustomerType.VIP } }),
      this.prisma.customer.count({ where: { type: CustomerType.RETAIL } }),
    ]);

    return {
      totalCustomers: total,
      wholesaleClients: wholesaleCount,
      vipClients: vipCount,
      retailCustomers: retailCount,
    };
  }
}
