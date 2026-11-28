import { Controller, Get, Param, Patch, Query, Req, UseGuards, UsePipes, ValidationPipe } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { SessionAuthGuard } from '../auth/guards/session-auth.guard';
import { Roles, RolesGuard } from '../auth/guards/roles.guard';
import { AdminSecurityService } from './admin-security.service';

export class SecurityQuery {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 20;
  @IsOptional() @IsString() @MaxLength(100) userId?: string;
}

export class SessionQuery extends SecurityQuery {
  @IsOptional() @IsIn(['all', 'active', 'invalid', 'expired']) status: string = 'all';
}

@Controller('admin-security')
@UseGuards(SessionAuthGuard, RolesGuard)
@Roles('ADMIN')
@UsePipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }))
export class AdminSecurityController {
  constructor(private readonly service: AdminSecurityService) {}

  @Get('users') users() { return this.service.users(); }
  @Get('activity') activity(@Query() query: SecurityQuery) { return this.service.activity(query); }
  @Get('sessions') sessions(@Query() query: SessionQuery, @Req() req: any) {
    return this.service.sessions(query, req.session.id);
  }
  @Patch('sessions/:id/revoke') revoke(@Param('id') id: string, @Req() req: any) {
    return this.service.revoke(id, req.session.id);
  }
  @Patch('users/:id/logout') logoutUser(@Param('id') id: string, @Req() req: any) {
    return this.service.logoutUser(id, req.session.id);
  }
}
