import { UseFilters } from '@nestjs/common';
import { PersistenceExceptionFilter } from '../common/persistence-exception.filter';
import { UsePipes, ValidationPipe } from '@nestjs/common';
import { ValidateCouponDto, CreateCouponDto, UpdateCouponDto } from '../common/admin.dto';
import { Roles, RolesGuard } from '../auth/guards/roles.guard';
import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { CouponsService } from './coupons.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
@UseFilters(PersistenceExceptionFilter)
@Controller('coupons')
export class CouponsController {
  constructor(private readonly couponsService: CouponsService) {}

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  findAll(@Query() query: any) {
    return this.couponsService.findAll(query);
  }

  @Post('validate')
  validate(@Body() body: ValidateCouponDto) {
    return this.couponsService.validateCoupon(body.code, Number(body.cartTotal));
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  findOne(@Param('id') id: string) {
    return this.couponsService.findOne(id);
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  create(@Body() body: CreateCouponDto) {
    return this.couponsService.create(body);
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  update(@Param('id') id: string, @Body() body: UpdateCouponDto) {
    return this.couponsService.update(id, body);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  remove(@Param('id') id: string) {
    return this.couponsService.remove(id);
  }
}
