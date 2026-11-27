import { Body, Controller, Get, Param, Post, Query, UseGuards, UsePipes, ValidationPipe } from '@nestjs/common';
import { SessionAuthGuard } from '../auth/guards/session-auth.guard';
import { Roles, RolesGuard } from '../auth/guards/roles.guard';
import { InactiveService } from './inactive.service';
import { ActivateInactiveDto, InactiveQueryDto } from './inactive.dto';

@Controller('inactive')
@UseGuards(SessionAuthGuard, RolesGuard)
@Roles('ADMIN')
@UsePipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }))
export class InactiveController {
  constructor(private readonly service: InactiveService) {}

  @Get(':type')
  list(@Param('type') type: string, @Query() query: InactiveQueryDto) {
    return this.service.list(type, query);
  }

  @Post(':type/activate')
  activate(@Param('type') type: string, @Body() body: ActivateInactiveDto) {
    return this.service.activate(type, body);
  }
}
