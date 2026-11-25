import { UsePipes, ValidationPipe } from '@nestjs/common';
import { BannerDto, PageDto, AnnouncementDto } from '../common/admin.dto';
import { Roles, RolesGuard } from '../auth/guards/roles.guard';
import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { CmsService } from './cms.service';
import { SessionAuthGuard } from '../auth/guards/session-auth.guard';

@ApiTags('Storefront CMS')
@UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
@Controller('cms')
export class CmsController {
  constructor(private readonly cmsService: CmsService) {}

  @Get('admin/banners')
  @UseGuards(SessionAuthGuard, RolesGuard)
  @Roles('ADMIN')
  async adminBanners() { return { success: true, data: await this.cmsService.getAllBanners(true) }; }

  @Get('admin/pages')
  @UseGuards(SessionAuthGuard, RolesGuard)
  @Roles('ADMIN')
  async adminPages() { return { success: true, data: await this.cmsService.getAllPages(true) }; }

  @Get('admin/announcement')
  @UseGuards(SessionAuthGuard, RolesGuard)
  @Roles('ADMIN')
  async adminAnnouncement() { return { success: true, data: await this.cmsService.getAnnouncement(true) }; }

  // --- BANNERS ---
  @Get('banners')
  @ApiOperation({ summary: 'Get all storefront hero banners & sliders' })
  async getBanners() {
    const banners = await this.cmsService.getAllBanners();
    return { success: true, data: banners };
  }

  @Get('banners/:id')
  @ApiOperation({ summary: 'Get single hero banner' })
  async getBanner(@Param('id') id: string) {
    const banner = await this.cmsService.getBanner(id);
    return { success: true, data: banner };
  }

  @Post('banners')
  @UseGuards(SessionAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create new storefront hero banner' })
  async createBanner(@Body() body: BannerDto) {
    const banner = await this.cmsService.createBanner(body);
    return { success: true, message: 'Banner created successfully', data: banner };
  }

  @Put('banners/:id')
  @UseGuards(SessionAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update storefront banner details' })
  async updateBanner(@Param('id') id: string, @Body() body: BannerDto) {
    const banner = await this.cmsService.updateBanner(id, body);
    return { success: true, message: 'Banner updated successfully', data: banner };
  }

  @Delete('banners/:id')
  @UseGuards(SessionAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete storefront banner' })
  async deleteBanner(@Param('id') id: string) {
    const banner = await this.cmsService.deleteBanner(id);
    return { success: true, message: 'Banner removed successfully', data: banner };
  }

  // --- PAGES ---
  @Get('pages')
  @ApiOperation({ summary: 'Get all webstore policy and informational pages' })
  async getPages() {
    const pages = await this.cmsService.getAllPages();
    return { success: true, data: pages };
  }

  @Get('pages/:slug')
  @ApiOperation({ summary: 'Get webstore page by slug' })
  async getPage(@Param('slug') slug: string) {
    const page = await this.cmsService.getPageBySlug(slug);
    return { success: true, data: page };
  }

  @Post('pages')
  @UseGuards(SessionAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create new webstore page' })
  async createPage(@Body() body: PageDto) {
    const page = await this.cmsService.createPage(body);
    return { success: true, message: 'Webstore page created successfully', data: page };
  }

  @Put('pages/:id')
  @UseGuards(SessionAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update webstore page content or publishing status' })
  async updatePage(@Param('id') id: string, @Body() body: PageDto) {
    const page = await this.cmsService.updatePage(id, body);
    return { success: true, message: 'Webstore page updated successfully', data: page };
  }

  @Delete('pages/:id')
  @UseGuards(SessionAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete webstore page' })
  async deletePage(@Param('id') id: string) {
    const page = await this.cmsService.deletePage(id);
    return { success: true, message: 'Webstore page deleted successfully', data: page };
  }

  // --- ANNOUNCEMENT ---
  @Get('announcement')
  @ApiOperation({ summary: 'Get active storefront announcement bar text & config' })
  async getAnnouncement() {
    const announcement = await this.cmsService.getAnnouncement();
    return { success: true, data: announcement };
  }

  @Put('announcement')
  @UseGuards(SessionAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update storefront announcement bar message and styles' })
  async updateAnnouncement(@Body() body: AnnouncementDto) {
    const announcement = await this.cmsService.updateAnnouncement(body);
    return { success: true, message: 'Storefront announcement updated', data: announcement };
  }
}
