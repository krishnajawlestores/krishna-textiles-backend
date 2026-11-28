import { activityWhere } from './activity-policy';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SecurityQuery, SessionQuery } from './admin-security.controller';
import { describeActivity } from './activity-description';

@Injectable()
export class AdminSecurityService {
  constructor(private readonly prisma: PrismaService) {}

  async users() {
    const current = await this.prisma.user.findMany({ where: { role: 'ADMIN' }, select: { id: true, name: true, email: true }, orderBy: { name: 'asc' } });
    const historical = await this.prisma.adminActivity.findMany({ distinct: ['userId'], select: { userId: true, userName: true, userEmail: true }, orderBy: { createdAt: 'desc' } });
    return [...current, ...historical.filter(h => !current.some(u => u.id === h.userId)).map(h => ({ id: h.userId, name: h.userName, email: h.userEmail }))];
  }

  async activity(query: SecurityQuery) {
    const where = { AND: [activityWhere, ...(query.userId ? [{ userId: query.userId }] : [])] };
    const total = await this.prisma.adminActivity.count({ where });
    const totalPages = Math.max(1, Math.ceil(total / query.limit));
    const page = Math.min(query.page, totalPages);
    const data = await this.prisma.adminActivity.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: (page - 1) * query.limit, take: query.limit });
    return { data: data.map(row => ({ ...row, description: row.description || describeActivity(row.action, row.path, {}, undefined, row.statusCode) })), total, page, totalPages };
  }

  async sessions(query: SessionQuery, currentSessionId: string) {
    const now = new Date();
    const statusFilter = query.status === 'active' ? { isValid: true, expiresAt: { gt: now } }
      : query.status === 'invalid' ? { isValid: false, OR: [{ revokedReason: null }, { revokedReason: { not: 'SESSION_EXPIRED' } }] }
      : query.status === 'expired' ? { OR: [{ isValid: true, expiresAt: { lte: now } }, { revokedReason: 'SESSION_EXPIRED' }] } : {};
    const where = { user: { role: 'ADMIN' as const }, ...statusFilter, ...(query.userId ? { userId: query.userId } : {}) };
    const total = await this.prisma.session.count({ where });
    const totalPages = Math.max(1, Math.ceil(total / query.limit));
    const page = Math.min(query.page, totalPages);
    const rows = await this.prisma.session.findMany({ where, select: {
      id: true, userId: true, deviceType: true, ipAddress: true, createdAt: true, lastActiveAt: true, expiresAt: true, isValid: true, revokedReason: true,
      user: { select: { id: true, name: true, email: true } },
    }, orderBy: [{ lastActiveAt: 'desc' }, { id: 'asc' }], skip: (page - 1) * query.limit, take: query.limit });
    return { data: rows.map(s => ({ ...s, isCurrent: s.id === currentSessionId,
      status: s.revokedReason === 'SESSION_EXPIRED' ? 'expired' : !s.isValid ? 'invalid' : s.expiresAt <= now ? 'expired' : 'active',
    })), total, page, totalPages };
  }

  async revoke(id: string, currentSessionId: string) {
    if (id === currentSessionId) throw new BadRequestException('Use Sign out to end your current session.');
    const result = await this.prisma.session.updateMany({ where: { id, user: { role: 'ADMIN' }, isValid: true }, data: { isValid: false, revokedReason: 'REVOKED_BY_ADMIN' } });
    if (!result.count) throw new NotFoundException('Active admin session not found.');
    return { success: true, count: result.count };
  }

  async logoutUser(userId: string, currentSessionId: string) {
    const user = await this.prisma.user.findFirst({ where: { id: userId, role: 'ADMIN' }, select: { id: true } });
    if (!user) throw new NotFoundException('Admin user not found.');
    const result = await this.prisma.session.updateMany({ where: { userId, user: { role: 'ADMIN' }, id: { not: currentSessionId }, isValid: true }, data: { isValid: false, revokedReason: 'FORCE_LOGOUT_BY_ADMIN' } });
    return { success: true, count: result.count };
  }
}
