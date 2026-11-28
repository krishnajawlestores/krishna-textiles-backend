import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { catchError, concatMap } from 'rxjs/operators';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ActivityInterceptor implements NestInterceptor {
  private readonly logger = new Logger(ActivityInterceptor.name);
  constructor(private readonly prisma: PrismaService) {}

  async intercept(context: ExecutionContext, next: CallHandler) {
    const req = context.switchToHttp().getRequest();
    const res = context.switchToHttp().getResponse();
    let actor = req.user;
    // Public catalogue routes also receive the admin session token.
    if (!actor && /^Bearer [^\s]+$/i.test(req.headers.authorization || '')) {
      const session = await this.prisma.session.findUnique({ where: { token: req.headers.authorization.slice(7) }, include: { user: { select: { id: true, name: true, email: true, role: true } } } });
      if (session?.isValid && session.expiresAt > new Date()) actor = session.user;
    }
    const record = async (statusCode: number, result?: any) => {
      const user = actor || (req.path === '/api/auth/login' ? result?.user : undefined);
      if (user?.role !== 'ADMIN') return;
      // Store only identity and action metadata, never bodies, query strings, passwords or tokens.
      const pageView = req.path === '/api/admin-security/page-view' && statusCode < 400;
      try {
        await this.prisma.adminActivity.create({ data: {
          userId: user.id, userName: user.name, userEmail: user.email,
          action: pageView ? 'PAGE_VIEW' : req.method,
          path: pageView ? req.body.path : req.path, statusCode,
        } });
      } catch { this.logger.error('Failed to persist admin activity'); }
    };
    return next.handle().pipe(
      concatMap(async result => { await record(res.statusCode, result); return result; }),
      catchError(async error => { await record(error.getStatus?.() || 500); throw error; }),
    );
  }
}
