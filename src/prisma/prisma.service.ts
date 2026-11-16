import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit() {
    await this.$connect();
    await this.ensureSchema();
  }

  private async ensureSchema() {
    try {
      // 1. Ensure sizeVariants column exists on Product table
      await this.$executeRawUnsafe(`
        ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "sizeVariants" JSONB DEFAULT '[]'::jsonb;
      `);

      // 2. Ensure gstRate and discountRate columns exist on Order table
      await this.$executeRawUnsafe(`
        ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "gstRate" DOUBLE PRECISION DEFAULT 5.0;
      `);
      await this.$executeRawUnsafe(`
        ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "discountRate" DOUBLE PRECISION DEFAULT 5.0;
      `);

      // 3. Ensure StoreSetting table exists
      await this.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "StoreSetting" (
          "id" TEXT NOT NULL,
          "companyName" TEXT NOT NULL DEFAULT 'Krishna Jawli Stores Pvt Ltd',
          "companyTagline" TEXT NOT NULL DEFAULT 'Leading Textile Manufacturers & Hosiery Wholesalers',
          "companyAddress" TEXT NOT NULL DEFAULT '88/4, Tiruppur Main Textile Complex',
          "companyCity" TEXT NOT NULL DEFAULT 'Tiruppur',
          "companyState" TEXT NOT NULL DEFAULT 'Tamil Nadu - 641604',
          "companyPincode" TEXT NOT NULL DEFAULT '641604',
          "companyPhone" TEXT NOT NULL DEFAULT '+91 421 249 8899',
          "companyEmail" TEXT NOT NULL DEFAULT 'billing@krishnatextiles.com',
          "companyGstin" TEXT NOT NULL DEFAULT '33AAACK9911D1ZX',
          "companyPan" TEXT NOT NULL DEFAULT 'AAACK9911D',
          "companyWebsite" TEXT NOT NULL DEFAULT 'www.krishnatextiles.com',
          "gstRate" DOUBLE PRECISION NOT NULL DEFAULT 5.0,
          "defaultDiscountRate" DOUBLE PRECISION NOT NULL DEFAULT 5.0,
          "minOrderValue" DOUBLE PRECISION NOT NULL DEFAULT 2999.0,
          "freeShippingThreshold" DOUBLE PRECISION NOT NULL DEFAULT 999.0,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "StoreSetting_pkey" PRIMARY KEY ("id")
        );
      `);

      this.logger.log('Database schema verification and self-heal completed successfully.');
    } catch (error) {
      this.logger.error('Error during database schema self-heal:', error);
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
