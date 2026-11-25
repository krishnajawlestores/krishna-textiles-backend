import { UseFilters } from '@nestjs/common';
import { PersistenceExceptionFilter } from '../common/persistence-exception.filter';
import { UsePipes, ValidationPipe } from '@nestjs/common';
import { RegisterCustomerDto, UpdateCustomerDto, CustomerNoteDto } from '../common/admin.dto';
import { Roles, RolesGuard } from '../auth/guards/roles.guard';
import { Controller, Get, Post, Put, Param, Query, Body, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { CrmService } from './crm.service';
import { CustomerType } from '@prisma/client';
import { SessionAuthGuard } from '../auth/guards/session-auth.guard';

@ApiTags('CRM & Customer Management')
@UseGuards(SessionAuthGuard, RolesGuard)
@Roles('ADMIN')
@UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
@UseFilters(PersistenceExceptionFilter)
@Controller('crm')
export class CrmController {
  constructor(private readonly crmService: CrmService) {}

  @Get('customers')
  @ApiOperation({ summary: 'Get all customers with metrics (LTV, total orders, last order date)' })
  async findAll(@Query('type') type?: CustomerType, @Query('search') search?: string) {
    const data = await this.crmService.findAll({ type, search });
    return {
      success: true,
      count: data.length,
      data,
    };
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get CRM client segmentation statistics' })
  async getStats() {
    const stats = await this.crmService.getCrmStats();
    return { success: true, data: stats };
  }

  @Get('customers/:id')
  @ApiOperation({ summary: 'Get complete customer profile, notes timeline, and order history' })
  async findOne(@Param('id') id: string) {
    const data = await this.crmService.findOne(id);
    return { success: true, data };
  }

  @Post('customers')
  @UseGuards(SessionAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create new customer / wholesale client' })
  async create(@Body() body: RegisterCustomerDto) {
    const data = await this.crmService.create(body);
    return {
      success: true,
      message: 'Customer registered successfully',
      data,
    };
  }

  @Put('customers/:id')
  @UseGuards(SessionAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update customer details' })
  async update(@Param('id') id: string, @Body() body: UpdateCustomerDto) {
    const data = await this.crmService.update(id, body);
    return {
      success: true,
      message: 'Customer updated successfully',
      data,
    };
  }

  @Post('customers/:id/notes')
  @UseGuards(SessionAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Add a new CRM interaction note/log' })
  async addNote(@Param('id') id: string, @Body() body: CustomerNoteDto, @Req() req: any) {
    const author = req.user?.name || 'Admin';
    const note = await this.crmService.addNote(id, body.note, author);
    return {
      success: true,
      message: 'Interaction note logged',
      data: note,
    };
  }
}
