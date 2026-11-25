import { Controller, Post, Body, Get, Req, UseGuards, UsePipes, ValidationPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiProperty } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { SessionAuthGuard } from './guards/session-auth.guard';
import { IsEmail, IsNotEmpty, IsString, IsOptional } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'admin@krishnatextiles.com' })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({ example: 'admin123' })
  @IsString()
  @IsNotEmpty()
  password: string;
}

export class RegisterDto {
  @ApiProperty({ example: 'staff@krishnatextiles.com' })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({ example: 'secret123' })
  @IsString()
  @IsNotEmpty()
  password: string;

  @ApiProperty({ example: 'Amit Kumar' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: '+91 99887 76655', required: false })
  @IsOptional()
  @IsString()
  phone?: string;

}

@ApiTags('Authentication')
@Controller('auth')
@UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @ApiOperation({ summary: 'Login and establish a monitored active session' })
  async login(@Body() body: LoginDto, @Req() req: any) {
    const ipAddress = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const userAgent = req.headers['user-agent'];

    return this.authService.login(body?.email, body?.password, {
      ipAddress: Array.isArray(ipAddress) ? ipAddress[0] : ipAddress,
      userAgent,
    });
  }

  @Post('register')
  @ApiOperation({ summary: 'Register a new customer' })
  async register(@Body() body: RegisterDto, @Req() req: any) {
    const ipAddress = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const userAgent = req.headers['user-agent'];
    return this.authService.register(body, {
      ipAddress: Array.isArray(ipAddress) ? ipAddress[0] : ipAddress,
      userAgent,
    });
  }

  @Post('logout')
  @UseGuards(SessionAuthGuard)
  @ApiOperation({ summary: 'Logout and revoke the current active session' })
  async logout(@Req() req: any) {
    return this.authService.logout(req.session.token);
  }

  @Get('profile')
  @UseGuards(SessionAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current user profile (requires active session)' })
  async getProfile(@Req() req: any) {
    return {
      success: true,
      user: req.user,
      session: {
        id: req.session.id,
        deviceType: req.session.deviceType,
        ipAddress: req.session.ipAddress,
        lastActiveAt: req.session.lastActiveAt,
        expiresAt: req.session.expiresAt,
      },
    };
  }
}
