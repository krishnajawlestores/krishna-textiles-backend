import { Req, UsePipes, ValidationPipe } from '@nestjs/common';
import { CreateOrderDto, VerifyPaymentDto, UpdateOrderStatusDto, UpdatePaymentDto } from './order.dto';
import { Roles, RolesGuard } from '../auth/guards/roles.guard';
import { Controller, Get, Post, Patch, Param, Query, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { OrdersService } from './orders.service';
import { OrderStatus, PaymentStatus } from '@prisma/client';
import { SessionAuthGuard } from '../auth/guards/session-auth.guard';

@ApiTags('Order Management')
@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  private customerOrder(order: any) {
    const { customer, razorpaySignature, paymentProofUrl, paymentNotes, ...safe } = order;
    return safe;
  }

  @Get()
  @UseGuards(SessionAuthGuard)
  @ApiOperation({ summary: 'Get all orders with pagination and status filters' })
  async findAll(
    @Req() req: any,
    @Query('status') status?: OrderStatus,
    @Query('search') search?: string,
    @Query('customerId') customerId?: string,
    @Query('customerEmail') customerEmail?: string,
    @Query('customerPhone') customerPhone?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.ordersService.findAll({ status, search, customerId, customerEmail, customerPhone, page, limit }, req.user);
  }

  @Get('razorpay/config')
  @ApiOperation({ summary: 'Get Razorpay public configuration (keyId)' })
  getRazorpayConfig() {
    const config = this.ordersService.getRazorpayConfig();
    return { success: true, data: config };
  }

  @Post('razorpay/create-order')
  @ApiOperation({ summary: 'Create a Razorpay order before initiating payment' })
  async createRazorpayOrder(@Body() body: { amount: number; receipt?: string; notes?: Record<string, string> }) {
    const data = await this.ordersService.createRazorpayOrder(body.amount, body.receipt, body.notes);
    return { success: true, data };
  }

  @Post('razorpay/verify')
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
  @ApiOperation({ summary: 'Verify Razorpay payment signature and complete order placement' })
  async verifyRazorpayPayment(
    @Body()
    body: VerifyPaymentDto,
  ) {
    const order = await this.ordersService.verifyAndCreateOrder(body);
    return {
      success: true,
      message: `Payment verified & order ${order.orderNumber} placed successfully`,
      data: this.customerOrder(order),
    };
  }

  @Get(':id')
  @UseGuards(SessionAuthGuard)
  @ApiOperation({ summary: 'Get order details with line items' })
  async findOne(@Param('id') id: string, @Req() req: any) {
    const data = await this.ordersService.findOne(id, req.user);
    return { success: true, data };
  }

  @Get(':id/invoice')
  @UseGuards(SessionAuthGuard)
  @ApiOperation({ summary: 'Get printable GST tax invoice data for order' })
  async getInvoice(@Param('id') id: string, @Req() req: any) {
    const data = await this.ordersService.getInvoiceData(id, req.user);
    return { success: true, data };
  }

  @Post()
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
  @ApiOperation({ summary: 'Create a new order (auto deducts stock & generates invoice)' })
  async create(@Body() body: CreateOrderDto) {
    const order = await this.ordersService.create(body);
    return {
      success: true,
      message: `Order ${order.orderNumber} placed successfully`,
      data: this.customerOrder(order),
    };
  }

  @Patch(':id/status')
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
  @UseGuards(SessionAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update order status and manual fulfillment details' })
  async updateStatus(
    @Param('id') id: string,
    @Body() body: UpdateOrderStatusDto,
  ) {
    const updated = await this.ordersService.updateStatus(
      id,
      body.status,
      body.trackingNumber,
      body.note,
      body.courierPartner,
      body.dispatchedAt,
      body.expectedDeliveryDate
    );
    return {
      success: true,
      message: `Order status updated to ${body.status}`,
      data: updated,
    };
  }

  @Patch(':id/payment')
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
  @UseGuards(SessionAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update order payment status' })
  async updatePayment(
    @Param('id') id: string,
    @Body()
    body: UpdatePaymentDto,
  ) {
    const updated = await this.ordersService.updatePayment(id, body);
    return {
      success: true,
      message: 'Payment status updated successfully',
      data: updated,
    };
  }
}
