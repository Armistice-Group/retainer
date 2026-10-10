-- CreateEnum
CREATE TYPE "ShareVerificationMode" AS ENUM ('INHERIT', 'ON', 'OFF');

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN "requireShareVerification" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Client" ADD COLUMN "shareExpiresAt" TIMESTAMP(3),
ADD COLUMN "shareVerification" "ShareVerificationMode" NOT NULL DEFAULT 'INHERIT';

-- AlterTable
ALTER TABLE "Project" ADD COLUMN "shareExpiresAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "ShareSession" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "ip" TEXT,
    "userAgent" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clientId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,

    CONSTRAINT "ShareSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShareCode" (
    "id" TEXT NOT NULL,
    "challengeHash" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clientId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,

    CONSTRAINT "ShareCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RateLimitHit" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RateLimitHit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ShareSession_tokenHash_key" ON "ShareSession"("tokenHash");

-- CreateIndex
CREATE INDEX "ShareSession_clientId_lastSeenAt_idx" ON "ShareSession"("clientId", "lastSeenAt");

-- CreateIndex
CREATE INDEX "ShareSession_contactId_idx" ON "ShareSession"("contactId");

-- CreateIndex
CREATE UNIQUE INDEX "ShareCode_challengeHash_key" ON "ShareCode"("challengeHash");

-- CreateIndex
CREATE INDEX "ShareCode_clientId_idx" ON "ShareCode"("clientId");

-- CreateIndex
CREATE INDEX "ShareCode_contactId_idx" ON "ShareCode"("contactId");

-- CreateIndex
CREATE INDEX "RateLimitHit_key_createdAt_idx" ON "RateLimitHit"("key", "createdAt");

-- AddForeignKey
ALTER TABLE "ShareSession" ADD CONSTRAINT "ShareSession_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShareSession" ADD CONSTRAINT "ShareSession_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShareCode" ADD CONSTRAINT "ShareCode_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShareCode" ADD CONSTRAINT "ShareCode_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;
