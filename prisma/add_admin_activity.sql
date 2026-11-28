CREATE TABLE IF NOT EXISTS "AdminActivity" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "userName" TEXT NOT NULL,
  "userEmail" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "path" TEXT NOT NULL,
  "statusCode" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "AdminActivity_createdAt_id_idx" ON "AdminActivity" ("createdAt", "id");
CREATE INDEX IF NOT EXISTS "AdminActivity_userId_createdAt_idx" ON "AdminActivity" ("userId", "createdAt");
ALTER TABLE "AdminActivity" ADD COLUMN IF NOT EXISTS "description" TEXT;
