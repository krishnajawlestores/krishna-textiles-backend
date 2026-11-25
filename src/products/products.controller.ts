import { UseFilters } from '@nestjs/common';
import { PersistenceExceptionFilter } from '../common/persistence-exception.filter';
import { activeFilter } from '../catalogue/catalogue-policy';
import { Roles, RolesGuard } from '../auth/guards/roles.guard';
import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ProductsService } from './products.service';
import { SessionAuthGuard } from '../auth/guards/session-auth.guard';

@ApiTags('Catalog & Products')
@UseFilters(PersistenceExceptionFilter)
@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  @ApiOperation({ summary: 'Get all catalog products with optional filters' })
  async findAll(
    @Query('category') category?: string,
    @Query('brandId') brandId?: string,
    @Query('categoryId') categoryId?: string,
    @Query('brandRefId') brandRefId?: string,
    @Query('search') search?: string,
    @Query('minPrice') minPrice?: number,
    @Query('maxPrice') maxPrice?: number,
    @Query('stockStatus') stockStatus?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    const result = await this.productsService.findAll({
      category,
      brandId,
      categoryId,
      brandRefId,
      search,
      minPrice,
      maxPrice,
      stockStatus,
      page,
      limit,
    });
    return {
      success: true,
      data: result.products,
      total: result.total,
      page: result.page,
      limit: result.limit,
      totalPages: result.totalPages,
    };
  }

  @Get('categories')
  @ApiOperation({ summary: 'Get list of product categories' })
  async getCategories() {
    const data = await this.productsService.getCategories();
    return { success: true, data };
  }

  @Get('brands')
  @ApiOperation({ summary: 'Get list of textile brands' })
  async getBrands() {
    const data = await this.productsService.getBrands();
    return { success: true, data };
  }

  @Get('admin')
  @UseGuards(SessionAuthGuard, RolesGuard)
  @Roles('ADMIN')
  async findAdmin(@Query() query: any) {
    const result = await this.productsService.findAll({ ...query, isActive: activeFilter(query.isActive) }, true);
    return { success: true, data: result.products, total: result.total, page: result.page, limit: result.limit, totalPages: result.totalPages };
  }

  @Get('admin/:id')
  @UseGuards(SessionAuthGuard, RolesGuard)
  @Roles('ADMIN')
  async findAdminOne(@Param('id') id: string) {
    return { success: true, data: await this.productsService.findOne(id, true) };
  }

  @Post(':id/restore')
  @UseGuards(SessionAuthGuard, RolesGuard)
  @Roles('ADMIN')
  async restore(@Param('id') id: string) {
    return { success: true, data: await this.productsService.restore(id) };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get single product details by ID or Slug' })
  async findOne(@Param('id') id: string) {
    const data = await this.productsService.findOne(id);
    return { success: true, data };
  }

  @Post()
  @UseGuards(SessionAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a new product' })
  async create(@Body() body: any) {
    const data = await this.productsService.create(body);
    return {
      success: true,
      message: 'Product created successfully',
      data,
    };
  }

  @Put(':id')
  @UseGuards(SessionAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update product details' })
  async update(@Param('id') id: string, @Body() body: any) {
    const data = await this.productsService.update(id, body);
    return {
      success: true,
      message: 'Product updated successfully',
      data,
    };
  }

  @Delete(':id')
  @UseGuards(SessionAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Archive product' })
  async remove(@Param('id') id: string) {
    return this.productsService.remove(id);
  }
}
