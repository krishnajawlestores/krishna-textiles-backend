import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { catchError, concatMap } from 'rxjs/operators';
import { PrismaService } from '../prisma/prisma.service';
import { shouldLogActivity } from './activity-policy';
import { describeActivity } from './activity-description';

@Injectable()
export class ActivityInterceptor implements NestInterceptor {
  private readonly logger = new Logger(ActivityInterceptor.name);
  constructor(private readonly prisma: PrismaService) {}

  async intercept(context: ExecutionContext, next: CallHandler) {
    const req = context.switchToHttp().getRequest();
    if (!shouldLogActivity(req.method, req.path)) return next.handle();
    const res = context.switchToHttp().getResponse();
    let actor = req.user;
    // Public order creation may also receive an authenticated admin token.
    if (!actor && /^Bearer [^\s]+$/i.test(req.headers.authorization || '')) {
      const session = await this.prisma.session.findUnique({ where: { token: req.headers.authorization.slice(7) }, include: { user: { select: { id: true, name: true, email: true, role: true } } } });
      if (session?.isValid && session.expiresAt > new Date()) actor = session.user;
    }
    let previous;
    if (actor?.role === 'ADMIN' && req.params?.id) {
      const lookup = {
        products: () => this.prisma.product.findUnique({ where: { id: req.params.id }, select: { name: true, isActive: true } }),
        categories: () => this.prisma.category.findUnique({ where: { id: req.params.id }, select: { name: true, isActive: true } }),
        brands: () => this.prisma.brand.findUnique({ where: { id: req.params.id }, select: { name: true, isActive: true } }),
        orders: () => this.prisma.order.findUnique({ where: { id: req.params.id }, select: { orderNumber: true } }),
      }[req.path.split('/')[2]];
      if (lookup) previous = await lookup();
    }
    const record = async (statusCode: number, result?: any) => {
      const user = actor;
      if (user?.role !== 'ADMIN') return;
      // Store only identity and action metadata, never bodies, query strings, passwords or tokens.
      try {
        await this.prisma.adminActivity.create({ data: {
          userId: user.id, userName: user.name, userEmail: user.email,
          action: req.method,
          description: describeActivity(req.method, req.path, req.body, result, statusCode, previous),
          path: req.path, statusCode,
        } });
      } catch { this.logger.error('Failed to persist admin activity'); }
    };
    return next.handle().pipe(
      concatMap(async result => { await record(res.statusCode, result); return result; }),
      catchError(async error => { await record(error.getStatus?.() || 500); throw error; }),
    );
  }
}
