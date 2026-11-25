import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { SessionService } from '../../session/session.service';

@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(private readonly sessionService: SessionService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers['authorization'];

    if (typeof authHeader !== 'string' || !/^Bearer [^\s]+$/i.test(authHeader)) {
      throw new UnauthorizedException('A valid Bearer token is required.');
    }

    let session;
    try {
      session = await this.sessionService.validateSession(authHeader.slice(7));
    } catch {
      throw new UnauthorizedException('Session validation failed.');
    }
    const expiresAt = new Date(session?.expiresAt).getTime();
    if (!session?.user || !session.isValid || !Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
      throw new UnauthorizedException('Invalid or expired session.');
    }

    // Attach user and session to request
    request.user = session.user;
    request.session = session;
    return true;
  }
}
