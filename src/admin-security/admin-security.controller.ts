import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards, UsePipes, ValidationPipe } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import { SessionAuthGuard } from '../auth/guards/session-auth.guard';
import { Roles, RolesGuard } from '../auth/guards/roles.guard';
import { AdminSecurityService } from './admin-security.service';

export class SecurityQuery {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 20;
  @IsOptional() @IsString() @MaxLength(100) userId?: string;
}
export class PageViewDto {
  @IsString() @MaxLength(200) @Matches(/^\/[a-zA-Z0-9/_-]*$/) path: string;
}

@Controller('admin-security')
@UseGuards(SessionAuthGuard, RolesGuard)
@Roles('ADMIN')
@UsePipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }))
export class AdminSecurityController {
  constructor(private readonly service: AdminSecurityService) {}

  @Get('users') users() { return this.service.users(); }
  @Get('activity') activity(@Query() query: SecurityQuery) { return this.service.activity(query); }
  @Post('page-view') pageView(@Body() body: PageViewDto) { return { success: true }; }
  @Get('sessions') sessions(@Query() query: SecurityQuery, @Req() req: any) {
    return this.service.sessions(query, req.session.id);
  }
  @Patch('sessions/:id/revoke') revoke(@Param('id') id: string, @Req() req: any) {
    return this.service.revoke(id, req.session.id);
  }
  @Patch('users/:id/logout') logoutUser(@Param('id') id: string, @Req() req: any) {
    return this.service.logoutUser(id, req.session.id);
  }
}
