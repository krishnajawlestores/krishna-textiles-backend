import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { CustomCacheModule } from './cache/cache.module';
import { SessionModule } from './session/session.module';
import { AuthModule } from './auth/auth.module';
import { ProductsModule } from './products/products.module';
import { InventoryModule } from './inventory/inventory.module';
import { OrdersModule } from './orders/orders.module';
import { CrmModule } from './crm/crm.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { CategoriesModule } from './categories/categories.module';
import { BrandsModule } from './brands/brands.module';
import { CouponsModule } from './coupons/coupons.module';
import { OffersModule } from './offers/offers.module';
import { CmsModule } from './cms/cms.module';
import { UploadModule } from './upload/upload.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    CustomCacheModule,
    SessionModule,
    AuthModule,
    CategoriesModule,
    BrandsModule,
    ProductsModule,
    InventoryModule,
    OrdersModule,
    CrmModule,
    AnalyticsModule,
    CouponsModule,
    OffersModule,
    CmsModule,
    UploadModule,
  ],
})
export class AppModule {}
