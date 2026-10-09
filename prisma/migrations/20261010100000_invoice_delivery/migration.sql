-- CreateEnum
CREATE TYPE "InvoiceEventType" AS ENUM ('EMAILED', 'REMINDED', 'EMAIL_OPENED', 'VIEWED', 'PDF_VIEWED');

-- AlterTable
ALTER TABLE "Client" ADD COLUMN     "invoiceReminders" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "firstViewedAt" TIMESTAMP(3),
ADD COLUMN     "lastViewedAt" TIMESTAMP(3),
ADD COLUMN     "viewAlertedAt" TIMESTAMP(3),
ADD COLUMN     "viewCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "viewToken" TEXT;

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "overdueReminderDays" INTEGER[] DEFAULT ARRAY[]::INTEGER[];

-- CreateTable
CREATE TABLE "InvoiceEvent" (
    "id" TEXT NOT NULL,
    "type" "InvoiceEventType" NOT NULL,
    "recipients" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "detail" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "invoiceId" TEXT NOT NULL,
    "actorId" TEXT,

    CONSTRAINT "InvoiceEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InvoiceEvent_invoiceId_createdAt_idx" ON "InvoiceEvent"("invoiceId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_viewToken_key" ON "Invoice"("viewToken");

-- AddForeignKey
ALTER TABLE "InvoiceEvent" ADD CONSTRAINT "InvoiceEvent_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceEvent" ADD CONSTRAINT "InvoiceEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

