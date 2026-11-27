-- Apply before deploying the inactive-records feature. Existing orders remain active.
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT true;
