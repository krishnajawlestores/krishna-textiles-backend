import { UseFilters } from '@nestjs/common';
import { PersistenceExceptionFilter } from '../common/persistence-exception.filter';
import { UsePipes, ValidationPipe } from '@nestjs/common';
import { AdjustStockDto, BulkAdjustStockDto } from '../common/admin.dto';
import { Roles, RolesGuard } from '../auth/guards/roles.guard';
import { Controller, Get, Post, Body, Query, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { InventoryService } from './inventory.service';
import { SessionAuthGuard } from '../auth/guards/session-auth.guard';

@ApiTags('Inventory Management')
@UseGuards(SessionAuthGuard, RolesGuard)
@Roles('ADMIN')
@UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
@UseFilters(PersistenceExceptionFilter)
@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get('summary')
  @ApiOperation({ summary: 'Get stock summary (total units, inventory valuation, low stock count)' })
  async getSummary() {
    const summary = await this.inventoryService.getInventorySummary();
    return { success: true, data: summary };
  }

  @Get('low-stock')
  @ApiOperation({ summary: 'Get list of items that have breached low stock threshold' })
  async getLowStock() {
    const items = await this.inventoryService.getLowStockAlerts();
    return {
      success: true,
      count: items.length,
      data: items,
    };
  }

  @Get('audits')
  @ApiOperation({ summary: 'Get historical inventory adjustment audit logs' })
  async getAudits(@Query('productId') productId?: string, @Query('limit') limit?: number) {
    const audits = await this.inventoryService.getAuditLogs(productId, limit ? Number(limit) : 50);
    return {
      success: true,
      count: audits.length,
      data: audits,
    };
  }

  @Post('adjust')
  @UseGuards(SessionAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Execute single stock adjustment (+/-) with reason and audit log' })
  async adjust(@Body() body: AdjustStockDto, @Req() req: any) {
    const createdBy = req.user?.name || 'Admin';
    const result = await this.inventoryService.adjustStock({
      productId: body.productId,
      delta: Number(body.delta),
      reason: body.reason,
      note: body.note,
      size: body.size,
      createdBy,
    });
    return {
      success: true,
      message: 'Stock updated and audit record logged',
      data: result,
    };
  }

  @Post('bulk-adjust')
  @UseGuards(SessionAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Batch inward/outward adjustment for multiple products' })
  async bulkAdjust(@Body() body: BulkAdjustStockDto, @Req() req: any) {
    const createdBy = req.user?.name || 'Admin';
    const itemsWithUser = (body.items || []).map((it) => ({ ...it, createdBy }));
    const results = await this.inventoryService.bulkAdjust(itemsWithUser);
    return {
      success: true,
      count: results.length,
      data: results,
    };
  }
}
