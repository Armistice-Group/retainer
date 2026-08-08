-- CreateEnum
CREATE TYPE "RecurringInterval" AS ENUM ('WEEKLY', 'MONTHLY');

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "recurringScheduleId" TEXT;

-- CreateTable
CREATE TABLE "RecurringInvoiceSchedule" (
    "id" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "interval" "RecurringInterval" NOT NULL DEFAULT 'MONTHLY',
    "dueInDays" INTEGER NOT NULL DEFAULT 30,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "autoSend" BOOLEAN NOT NULL DEFAULT false,
    "nextRunAt" TIMESTAMP(3) NOT NULL,
    "lastRunAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "orgId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,

    CONSTRAINT "RecurringInvoiceSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RecurringInvoiceSchedule_orgId_idx" ON "RecurringInvoiceSchedule"("orgId");

-- CreateIndex
CREATE INDEX "RecurringInvoiceSchedule_clientId_idx" ON "RecurringInvoiceSchedule"("clientId");

-- CreateIndex
CREATE INDEX "RecurringInvoiceSchedule_nextRunAt_idx" ON "RecurringInvoiceSchedule"("nextRunAt");

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_recurringScheduleId_fkey" FOREIGN KEY ("recurringScheduleId") REFERENCES "RecurringInvoiceSchedule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringInvoiceSchedule" ADD CONSTRAINT "RecurringInvoiceSchedule_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringInvoiceSchedule" ADD CONSTRAINT "RecurringInvoiceSchedule_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

