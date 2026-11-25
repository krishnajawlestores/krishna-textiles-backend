import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { SessionService } from '../session/session.service';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly sessionService: SessionService,
  ) {}

  async login(email: string, pass: string, meta: { ipAddress?: string; userAgent?: string }) {
    if (!email || typeof email !== 'string' || !pass || typeof pass !== 'string') {
      throw new BadRequestException('Email and password are required.');
    }

    const user = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid email or password.');
    }

    const isMatch = await bcrypt.compare(pass, user.passwordHash);
    if (!isMatch) {
      throw new UnauthorizedException('Invalid email or password.');
    }

    const payload = { sub: user.id, email: user.email, role: user.role };
    const accessToken = this.jwtService.sign(payload);

    // Create persistent session
    const session = await this.sessionService.createSession({
      userId: user.id,
      token: accessToken,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });

    return {
      accessToken,
      session: {
        id: session.id,
        deviceType: session.deviceType,
        expiresAt: session.expiresAt,
      },
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        phone: user.phone,
        avatar: user.avatar,
      },
    };
  }

  async logout(token: string) {
    if (!token) return { success: true };
    const session = await this.prisma.session.findUnique({ where: { token } });
    if (session) {
      await this.sessionService.revokeSession(session.id, 'USER_LOGOUT');
    }
    return { success: true, message: 'Logged out successfully.' };
  }

  async register(
    data: { email: string; password: string; name: string; phone?: string; role?: any },
    meta?: { ipAddress?: string; userAgent?: string },
  ) {
    if (!data?.email || typeof data.email !== 'string' || !data?.password || typeof data.password !== 'string') {
      throw new BadRequestException('Valid email and password are required.');
    }

    const existing = await this.prisma.user.findUnique({
      where: { email: data.email.toLowerCase().trim() },
    });
    if (existing) {
      throw new BadRequestException('User with this email already exists.');
    }

    const role = 'CUSTOMER' as const;
    const passwordHash = await bcrypt.hash(data.password, 10);
    const user = await this.prisma.user.create({
      data: {
        email: data.email.toLowerCase().trim(),
        passwordHash,
        name: data.name,
        phone: data.phone,
        role,
      },
    });

    if (role === 'CUSTOMER' && data.phone) {
      const existingCust = await this.prisma.customer.findUnique({
        where: { phone: data.phone },
      });
      if (!existingCust) {
        await this.prisma.customer.create({
          data: {
            name: data.name,
            phone: data.phone,
            email: data.email.toLowerCase().trim(),
            type: 'RETAIL',
          },
        }).catch(() => {});
      }
    }

    const payload = { sub: user.id, email: user.email, role: user.role };
    const accessToken = this.jwtService.sign(payload);

    // Create persistent session
    const session = await this.sessionService.createSession({
      userId: user.id,
      token: accessToken,
      ipAddress: meta?.ipAddress,
      userAgent: meta?.userAgent,
    });

    return {
      accessToken,
      session: {
        id: session.id,
        deviceType: session.deviceType,
        expiresAt: session.expiresAt,
      },
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        phone: user.phone,
        avatar: user.avatar,
      },
    };
  }

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        phone: true,
        avatar: true,
        createdAt: true,
      },
    });
    if (!user) throw new UnauthorizedException('User not found.');
    return user;
  }
}
