-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'EXPENSE_SUBMITTED';
ALTER TYPE "NotificationType" ADD VALUE 'EXPENSE_REVIEWED';

-- CreateTable
CREATE TABLE "TwoFactorLoginTicket" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "failedAttempts" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TwoFactorLoginTicket_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TwoFactorLoginTicket_tokenHash_key" ON "TwoFactorLoginTicket"("tokenHash");

-- CreateIndex
CREATE INDEX "TwoFactorLoginTicket_userId_idx" ON "TwoFactorLoginTicket"("userId");

-- AddForeignKey
ALTER TABLE "TwoFactorLoginTicket" ADD CONSTRAINT "TwoFactorLoginTicket_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
