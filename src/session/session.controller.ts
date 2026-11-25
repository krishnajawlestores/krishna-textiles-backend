import { UseFilters } from '@nestjs/common';
import { PersistenceExceptionFilter } from '../common/persistence-exception.filter';
import { Controller, Get, Delete, Param, Post, Req, Query, Body, UseGuards, ForbiddenException, UsePipes, ValidationPipe } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { SessionService } from './session.service';
import { SessionAuthGuard } from '../auth/guards/session-auth.guard';

export class SessionActionDto {
  @IsOptional() @IsString() @MaxLength(200) reason?: string;
  // Retained for compatibility, checked against the authenticated identity.
  @IsOptional() @IsString() userId?: string;
  @IsOptional() @IsString() currentToken?: string;
}

@ApiTags('User Session Management')
@UseFilters(PersistenceExceptionFilter)
@Controller('session')
@UseGuards(SessionAuthGuard)
@UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
export class SessionController {
  constructor(private readonly sessionService: SessionService) {}

  private scope(req: any, userId?: string) {
    if (req.user.role === 'ADMIN') return userId;
    if (userId && userId !== req.user.id) throw new ForbiddenException('You may only manage your own sessions.');
    return req.user.id;
  }

  private safeSession(session: any) {
    const { token, ...safe } = session;
    return safe;
  }

  @Get('active')
  async getActiveSessions(@Req() req: any, @Query('userId') userId?: string) {
    const sessions = await this.sessionService.getActiveSessions(this.scope(req, userId));
    return { success: true, count: sessions.length, data: sessions.map(s => this.safeSession(s)) };
  }

  @Get('all')
  async getAllSessions(@Req() req: any, @Query('userId') userId?: string) {
    const sessions = await this.sessionService.getAllSessions(this.scope(req, userId));
    return { success: true, count: sessions.length, data: sessions.map(s => this.safeSession(s)) };
  }

  @Get('stats')
  async getSessionStats(@Req() req: any, @Query('userId') userId?: string) {
    return { success: true, data: await this.sessionService.getSessionStats(this.scope(req, userId)) };
  }

  @Delete(':id')
  async revokeSession(@Param('id') id: string, @Body() body: SessionActionDto, @Req() req: any) {
    this.scope(req, body?.userId);
    const revoked = await this.sessionService.revokeSession(id, body?.reason || 'USER_REVOCATION', req.user);
    return { success: true, message: 'Session successfully revoked.', data: this.safeSession(revoked) };
  }

  @Post('revoke-others')
  @ApiOperation({ summary: 'Revoke other sessions of the authenticated user' })
  async revokeOthers(@Body() body: SessionActionDto, @Req() req: any) {
    if ((body?.userId && body.userId !== req.user.id) || (body?.currentToken && body.currentToken !== req.session.token)) {
      throw new ForbiddenException('Current user and session must match authentication.');
    }
    const result = await this.sessionService.revokeOtherSessions(req.user.id, req.session.token);
    return { success: true, message: `Revoked ${result.count} other active sessions.`, count: result.count };
  }

  @Post('revoke-all')
  async revokeAll(@Body() body: SessionActionDto, @Req() req: any) {
    const userId = this.scope(req, body?.userId) || req.user.id;
    const result = await this.sessionService.revokeAllUserSessions(userId, body?.reason);
    return { success: true, message: `Revoked ${result.count} sessions for user.`, count: result.count };
  }
}
