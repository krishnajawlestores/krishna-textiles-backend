import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CustomCacheService } from '../cache/custom-cache.service';
import { OrderStatus, PaymentStatus } from '@prisma/client';
import * as crypto from 'crypto';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const Razorpay = require('razorpay');

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CustomCacheService,
  ) {}

  async onModuleInit() {
    await this.syncOrphanOrdersToCustomers();
  }

  async syncOrphanOrdersToCustomers() {
    try {
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
    } catch (err) {
      console.error('Error syncing orphan orders to customers:', err);
    }
  }

  async findAll(params: {
    status?: OrderStatus;
    search?: string;
    customerId?: string;
    customerEmail?: string;
    customerPhone?: string;
    page?: number;
    limit?: number;
  }) {
    const page = params.page ? Number(params.page) : 1;
    const limit = params.limit ? Number(params.limit) : 15;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (params.status && params.status !== ('ALL' as any)) {
      if ((params.status as string) === 'CONFIRMED' || (params.status as string) === 'PENDING') {
        where.status = { in: ['CONFIRMED', 'PENDING'] };
      } else {
        where.status = params.status;
      }
    }
    if (params.customerId) {
      where.customerId = params.customerId;
    }
    if (params.customerEmail) {
      where.customerEmail = { equals: params.customerEmail, mode: 'insensitive' };
    }
    if (params.customerPhone) {
      where.customerPhone = params.customerPhone;
    }
    if (params.search) {
      where.OR = [
        { orderNumber: { contains: params.search, mode: 'insensitive' } },
        { customerName: { contains: params.search, mode: 'insensitive' } },
        { customerPhone: { contains: params.search, mode: 'insensitive' } },
        { customerEmail: { contains: params.search, mode: 'insensitive' } },
      ];
    }

    const [total, orders] = await Promise.all([
      this.prisma.order.count({ where }),
      this.prisma.order.findMany({
        where,
        include: {
          items: {
            include: {
              product: true,
            },
          },
          customer: true,
          history: {
            orderBy: { createdAt: 'desc' },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
    ]);

    return {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      orders,
    };
  }

  async findOne(id: string) {
    const order = await this.prisma.order.findFirst({
      where: {
        OR: [{ id }, { orderNumber: id }],
      },
      include: {
        items: {
          include: {
            product: true,
          },
        },
        customer: true,
        history: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!order) throw new NotFoundException(`Order '${id}' not found`);
    return order;
  }

  async getOrderHistory(id: string) {
    const order = await this.findOne(id);
    return this.prisma.orderStatusHistory.findMany({
      where: { orderId: order.id },
      orderBy: { createdAt: 'desc' },
    });
  }

  private razorpayInstance: any = null;

  private getRazorpay(): any {
    if (!this.razorpayInstance) {
      const key_id = process.env.RAZORPAY_KEY_ID || 'rzp_test_ThMMNStuG17mBM';
      const key_secret = process.env.RAZORPAY_KEY_SECRET || 'Zj0mB3pCNaU2A5P4ilzozqxb';
      this.razorpayInstance = new Razorpay({
        key_id,
        key_secret,
      });
    }
    return this.razorpayInstance;
  }

  getRazorpayConfig() {
    return {
      keyId: process.env.RAZORPAY_KEY_ID || 'rzp_test_ThMMNStuG17mBM',
      currency: 'INR',
    };
  }

  async createRazorpayOrder(amount: number, receipt?: string, notes?: Record<string, string>) {
    if (!amount || Number(amount) <= 0) {
      throw new BadRequestException('Amount must be greater than zero');
    }
    const rzp = this.getRazorpay();
    const amountInPaise = Math.round(Number(amount) * 100);
    const options = {
      amount: amountInPaise,
      currency: 'INR',
      receipt: receipt || `kt_rcpt_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      payment_capture: 1,
      notes: notes || {},
    };
    try {
      const razorpayOrder = await rzp.orders.create(options);
      return {
        id: razorpayOrder.id,
        amount: razorpayOrder.amount,
        currency: razorpayOrder.currency,
        receipt: razorpayOrder.receipt,
        keyId: process.env.RAZORPAY_KEY_ID || 'rzp_test_ThMMNStuG17mBM',
      };
    } catch (err: any) {
      console.error('Razorpay order creation error:', err);
      throw new BadRequestException(
        err?.error?.description || err.message || 'Razorpay order creation failed'
      );
    }
  }

  verifyRazorpaySignature(
    razorpayOrderId: string,
    razorpayPaymentId: string,
    razorpaySignature: string,
  ): boolean {
    const key_secret = process.env.RAZORPAY_KEY_SECRET || 'Zj0mB3pCNaU2A5P4ilzozqxb';
    const body = `${razorpayOrderId}|${razorpayPaymentId}`;
    const expectedSignature = crypto
      .createHmac('sha256', key_secret)
      .update(body.toString())
      .digest('hex');

    return expectedSignature === razorpaySignature;
  }

  async verifyAndCreateOrder(payload: {
    razorpayOrderId: string;
    razorpayPaymentId: string;
    razorpaySignature: string;
    orderData: any;
  }) {
    const isValid = this.verifyRazorpaySignature(
      payload.razorpayOrderId,
      payload.razorpayPaymentId,
      payload.razorpaySignature,
    );

    if (!isValid) {
      throw new BadRequestException('Payment verification failed. Invalid Razorpay signature.');
    }

    const orderPayload = {
      ...payload.orderData,
      paymentMethod: 'RAZORPAY',
      paymentStatus: PaymentStatus.PAID,
      razorpayOrderId: payload.razorpayOrderId,
      razorpayPaymentId: payload.razorpayPaymentId,
      razorpaySignature: payload.razorpaySignature,
    };

    return this.create(orderPayload);
  }

  async create(data: {
    customerId?: string;
    customerName: string;
    customerPhone: string;
    customerEmail?: string;
    shippingAddress: string;
    paymentMethod?: string;
    paymentStatus?: PaymentStatus;
    notes?: string;
    razorpayOrderId?: string;
    razorpayPaymentId?: string;
    razorpaySignature?: string;
    items: Array<{
      productId?: string;
      productName: string;
      size?: string;
      color?: string;
      quantity: number;
      unitPrice: number;
    }>;
  }) {
    if (!data.items || data.items.length === 0) {
      throw new BadRequestException('An order must contain at least one item.');
    }

    const trimmedPhone = data.customerPhone ? data.customerPhone.trim() : '';
    const trimmedEmail = data.customerEmail ? data.customerEmail.trim().toLowerCase() : null;

    // Safely resolve Customer in CRM directory
    let customerId: string | null = null;
    if (data.customerId) {
      const existingById = await this.prisma.customer.findUnique({
        where: { id: data.customerId },
      });
      if (existingById) {
        customerId = existingById.id;
      }
    }

    if (!customerId && (trimmedPhone || trimmedEmail)) {
      let customer = null;
      if (trimmedPhone) {
        customer = await this.prisma.customer.findUnique({
          where: { phone: trimmedPhone },
        });
      }
      if (!customer && trimmedEmail) {
        customer = await this.prisma.customer.findUnique({
          where: { email: trimmedEmail },
        });
      }
      if (!customer && trimmedPhone) {
        try {
          customer = await this.prisma.customer.create({
            data: {
              name: data.customerName || 'Customer',
              phone: trimmedPhone,
              email: trimmedEmail,
              address: data.shippingAddress || null,
              type: 'RETAIL',
            },
          });
        } catch (err) {
          // If concurrent insert or unique conflict, fetch existing
          customer = await this.prisma.customer.findFirst({
            where: {
              OR: [
                { phone: trimmedPhone },
                ...(trimmedEmail ? [{ email: trimmedEmail }] : []),
              ],
            },
          });
        }
      }
      if (customer) {
        customerId = customer.id;
      }
    }

    // 9-digit numeric order number format
    const orderNumber = Math.floor(100000000 + Math.random() * 900000000).toString();

    // Safely validate and resolve line items
    let subtotal = 0;
    const validatedLineItems = [];

    for (const item of data.items) {
      let validProductId: string | null = null;
      if (item.productId) {
        const prod = await this.prisma.product.findUnique({
          where: { id: item.productId },
        });
        if (prod) {
          validProductId = prod.id;
        }
      }

      const qty = Number(item.quantity) || 1;
      const price = Number(item.unitPrice) || 0;
      const lineTotal = qty * price;
      subtotal += lineTotal;

      validatedLineItems.push({
        productId: validProductId,
        productName: item.productName || 'Textile Item',
        size: item.size || 'Standard',
        color: item.color || null,
        quantity: qty,
        unitPrice: price,
        totalPrice: lineTotal,
      });
    }

    const taxAmount = Math.round(subtotal * 0.05); // 5% GST
    const discountAmount = 0;
    const totalAmount = subtotal + taxAmount - discountAmount;

    const resolvedPaymentStatus = data.paymentStatus || PaymentStatus.UNPAID;

    const historyNote = 'Order placed successfully. Payment pending (Our team will contact you).';

    // Order placed into database; initial fulfillment stage is Dispatch Pending (CONFIRMED)
    const order = await this.prisma.order.create({
      data: {
        orderNumber,
        customerId,
        customerName: data.customerName,
        customerPhone: trimmedPhone || 'N/A',
        customerEmail: trimmedEmail,
        shippingAddress: data.shippingAddress,
        paymentMethod: data.paymentMethod || 'PAY_LATER',
        paymentStatus: resolvedPaymentStatus,
        status: OrderStatus.CONFIRMED, // Dispatch Pending
        subtotal,
        taxAmount,
        discountAmount,
        totalAmount,
        notes: data.notes || null,
        razorpayOrderId: data.razorpayOrderId || null,
        razorpayPaymentId: data.razorpayPaymentId || null,
        razorpaySignature: data.razorpaySignature || null,
        items: {
          create: validatedLineItems,
        },
        history: {
          create: {
            status: OrderStatus.CONFIRMED,
            note: historyNote,
            changedBy: 'System',
          },
        },
      },
      include: { items: { include: { product: true } }, customer: true, history: true },
    });

    // Safely deduct stock for valid products & create audit log
    for (const item of validatedLineItems) {
      if (item.productId) {
        try {
          const prod = await this.prisma.product.findUnique({ where: { id: item.productId } });
          if (prod) {
            const newStock = Math.max(0, prod.stock - item.quantity);
            await this.prisma.product.update({
              where: { id: prod.id },
              data: { stock: newStock },
            });
            await this.prisma.inventoryAudit.create({
              data: {
                productId: prod.id,
                previousStock: prod.stock,
                newStock,
                delta: -item.quantity,
                reason: 'Sale',
                note: `Order #${orderNumber} confirmation deduction.`,
                createdBy: 'Order Engine',
              },
            });
          }
        } catch (stockErr) {
          console.warn(`Failed to deduct inventory for product ${item.productId}:`, stockErr);
        }
      }
    }

    try {
      await this.cache.invalidatePrefix('analytics:');
      await this.cache.invalidatePrefix('inventory:');
      await this.cache.invalidatePrefix('products:');
      await this.cache.invalidatePrefix('crm:');
    } catch (cacheErr) {
      console.warn('Cache invalidation warning:', cacheErr);
    }

    return order;
  }

  async updateStatus(
    id: string, 
    status: OrderStatus, 
    trackingNumber?: string, 
    note?: string,
    courierPartner?: string,
    dispatchedAt?: string,
    expectedDeliveryDate?: string
  ) {
    const order = await this.prisma.order.findFirst({
      where: { OR: [{ id }, { orderNumber: id }] },
      include: { items: true },
    });
    if (!order) throw new NotFoundException(`Order '${id}' not found`);

    const validFulfillmentStatuses: OrderStatus[] = [
      OrderStatus.CONFIRMED,
      OrderStatus.PROCESSING,
      OrderStatus.PENDING,
      OrderStatus.DISPATCHED,
      OrderStatus.DELIVERED,
      OrderStatus.CANCELLED,
    ];
    if (!validFulfillmentStatuses.includes(status)) {
      throw new BadRequestException(`Invalid fulfillment status: ${status}. Supported stages: Dispatch Pending, Processing, Shipped, Delivered, Cancelled.`);
    }

    // If order is cancelled, restore item stock
    if (status === OrderStatus.CANCELLED && order.status !== OrderStatus.CANCELLED) {
      for (const item of order.items) {
        if (item.productId) {
          const prod = await this.prisma.product.findUnique({ where: { id: item.productId } });
          if (prod) {
            const newStock = prod.stock + item.quantity;
            await this.prisma.product.update({
              where: { id: prod.id },
              data: { stock: newStock },
            });
            await this.prisma.inventoryAudit.create({
              data: {
                productId: prod.id,
                previousStock: prod.stock,
                newStock,
                delta: item.quantity,
                reason: 'Cancellation Restock',
                note: `Order #${order.orderNumber} cancelled. Stock restored.`,
                createdBy: 'Admin Order Engine',
              },
            });
          }
        }
      }
    }

    const updateData: any = { status };

    if (trackingNumber !== undefined) {
      updateData.trackingNumber = trackingNumber;
    }
    if (courierPartner !== undefined) {
      updateData.courierPartner = courierPartner;
    }

    // When moving to Shipped (DISPATCHED), Expected Delivery Date defaults to +3 days if not provided
    if (status === OrderStatus.DISPATCHED) {
      const defaultExpDate = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
      const expDate = expectedDeliveryDate || (order.expectedDeliveryDate ? order.expectedDeliveryDate.toISOString() : defaultExpDate);
      updateData.expectedDeliveryDate = new Date(expDate);
      updateData.dispatchedAt = dispatchedAt ? new Date(dispatchedAt) : (order.dispatchedAt || new Date());
    } else if (expectedDeliveryDate !== undefined) {
      updateData.expectedDeliveryDate = expectedDeliveryDate ? new Date(expectedDeliveryDate) : null;
    }

    if (dispatchedAt !== undefined && status !== OrderStatus.DISPATCHED) {
      updateData.dispatchedAt = dispatchedAt ? new Date(dispatchedAt) : null;
    }

    if (status === OrderStatus.DELIVERED) {
      updateData.paymentStatus = PaymentStatus.PAID;
    }

    const updated = await this.prisma.order.update({
      where: { id: order.id },
      data: updateData,
      include: { items: { include: { product: true } }, customer: true, history: true },
    });

    // Build descriptive timeline note
    let historyNote = note;
    if (!historyNote) {
      const details = [];
      if (courierPartner || updated.courierPartner) details.push(`Courier: ${courierPartner || updated.courierPartner}`);
      if (trackingNumber || updated.trackingNumber) details.push(`AWB: ${trackingNumber || updated.trackingNumber}`);
      if (updateData.expectedDeliveryDate || updated.expectedDeliveryDate) {
        details.push(`Est. Delivery: ${new Date(updateData.expectedDeliveryDate || updated.expectedDeliveryDate).toLocaleDateString('en-IN')}`);
      }
      const label = status === OrderStatus.DISPATCHED ? 'Shipped' : status === OrderStatus.DELIVERED ? 'Delivered' : status === OrderStatus.PROCESSING ? 'Processing' : status === OrderStatus.CANCELLED ? 'Cancelled' : 'Dispatch Pending';
      historyNote = details.length > 0 
        ? `Stage changed to ${label} (${details.join(', ')})`
        : `Stage changed to ${label}`;
    }

    // Record timeline history
    await this.prisma.orderStatusHistory.create({
      data: {
        orderId: order.id,
        status,
        note: historyNote,
        changedBy: 'Admin',
      },
    });

    await this.cache.invalidatePrefix('analytics:');
    await this.cache.invalidatePrefix('inventory:');
    await this.cache.invalidatePrefix('crm:');
    return updated;
  }

  async updatePayment(
    id: string,
    payload:
      | PaymentStatus
      | {
          paymentStatus: PaymentStatus;
          paymentMethod?: string;
          paymentProofUrl?: string;
          paymentReceivedAt?: string | Date;
          paymentNotes?: string;
        },
    legacyPaymentMethod?: string,
  ) {
    const order = await this.prisma.order.findFirst({
      where: { OR: [{ id }, { orderNumber: id }] },
    });
    if (!order) throw new NotFoundException(`Order '${id}' not found`);

    let paymentStatus: PaymentStatus;
    let paymentMethod = legacyPaymentMethod || order.paymentMethod;
    let paymentProofUrl = order.paymentProofUrl;
    let paymentReceivedAt = order.paymentReceivedAt;
    let paymentNotes = order.paymentNotes;

    if (typeof payload === 'string') {
      paymentStatus = payload as PaymentStatus;
      if (paymentStatus === PaymentStatus.PAID && !paymentReceivedAt) {
        paymentReceivedAt = new Date();
      }
    } else {
      paymentStatus = payload.paymentStatus;
      if (payload.paymentMethod) {
        paymentMethod = payload.paymentMethod;
      }
      if (payload.paymentProofUrl !== undefined) {
        paymentProofUrl = payload.paymentProofUrl;
      }
      if (payload.paymentReceivedAt !== undefined) {
        paymentReceivedAt = payload.paymentReceivedAt
          ? new Date(payload.paymentReceivedAt)
          : null;
      } else if (paymentStatus === PaymentStatus.PAID && !paymentReceivedAt) {
        paymentReceivedAt = new Date();
      }
      if (payload.paymentNotes !== undefined) {
        paymentNotes = payload.paymentNotes;
      }
    }

    if (paymentStatus === PaymentStatus.UNPAID) {
      paymentReceivedAt = null;
    }

    const updated = await this.prisma.order.update({
      where: { id: order.id },
      data: {
        paymentStatus,
        paymentMethod,
        paymentProofUrl,
        paymentReceivedAt,
        paymentNotes,
      },
      include: { items: true, history: true },
    });

    const isPaid = paymentStatus === PaymentStatus.PAID;
    const noteText = isPaid
      ? `Payment received recorded by Admin.${paymentProofUrl ? ' Proof screenshot uploaded.' : ''}${paymentNotes ? ` Note: ${paymentNotes}` : ''}`
      : 'Payment status updated to Payment Pending by Admin.';

    await this.prisma.orderStatusHistory.create({
      data: {
        orderId: order.id,
        status: order.status,
        note: noteText,
        changedBy: 'Admin',
      },
    });

    await this.cache.invalidatePrefix('analytics:');
    return updated;
  }

  async getInvoiceData(id: string) {
    const order = await this.findOne(id);
    return {
      company: {
        name: 'Krishna Jawli Stores Pvt Ltd',
        tagline: 'Leading Textile Manufacturers & Hosiery Wholesalers',
        gstin: '33AAACK9911D1ZX',
        pan: 'AAACK9911D',
        address: '88/4, Tiruppur Main Textile Complex',
        city: 'Tiruppur',
        state: 'Tamil Nadu - 641604',
        phone: '+91 421 249 8899',
        email: 'billing@krishnatextiles.com',
        website: 'www.krishnatextiles.com',
      },
      order,
    };
  }
}
