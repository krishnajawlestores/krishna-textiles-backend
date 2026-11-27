import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { CustomCacheModule } from '../cache/cache.module';
import { SessionModule } from '../session/session.module';
import { CmsModule } from '../cms/cms.module';
import { InactiveController } from './inactive.controller';
import { InactiveService } from './inactive.service';

@Module({ imports: [PrismaModule, CustomCacheModule, SessionModule, CmsModule], controllers: [InactiveController], providers: [InactiveService] })
export class InactiveModule {}
