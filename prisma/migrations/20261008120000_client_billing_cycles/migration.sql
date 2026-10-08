-- AlterEnum


ALTER TYPE "RecurringInterval" ADD VALUE 'BIWEEKLY';
ALTER TYPE "RecurringInterval" ADD VALUE 'SEMIMONTHLY';
ALTER TYPE "RecurringInterval" ADD VALUE 'QUARTERLY';
ALTER TYPE "RecurringInterval" ADD VALUE 'YEARLY';

-- CreateTable
CREATE TABLE "ClientBillingCycle" (
    "id" TEXT NOT NULL,
    "interval" "RecurringInterval" NOT NULL,
    "anchorDay" INTEGER NOT NULL,
    "paymentTerms" "PaymentTerms" NOT NULL DEFAULT 'NET30',
    "autoSend" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "nextRunAt" TIMESTAMP(3) NOT NULL,
    "lastRunAt" TIMESTAMP(3),
    "lastInvoiceId" TEXT,
    "lastRunNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "orgId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,

    CONSTRAINT "ClientBillingCycle_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ClientBillingCycle_clientId_key" ON "ClientBillingCycle"("clientId");

-- CreateIndex
CREATE INDEX "ClientBillingCycle_nextRunAt_idx" ON "ClientBillingCycle"("nextRunAt");

-- AddForeignKey
ALTER TABLE "ClientBillingCycle" ADD CONSTRAINT "ClientBillingCycle_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientBillingCycle" ADD CONSTRAINT "ClientBillingCycle_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

