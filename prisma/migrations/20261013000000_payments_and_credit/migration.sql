-- Partial payments, deposits and credit notes.

-- CreateEnum
CREATE TYPE "InvoiceKind" AS ENUM ('STANDARD', 'DEPOSIT');
CREATE TYPE "PaymentSource" AS ENUM ('MANUAL', 'STRIPE', 'MERCURY', 'QUICKBOOKS');
CREATE TYPE "CreditNoteStatus" AS ENUM ('ISSUED', 'VOID');

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'PAYMENT_RECEIVED';
ALTER TYPE "NotificationType" ADD VALUE 'PAYMENT_FAILED';

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN "nextCreditNoteNumber" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "Invoice" ADD COLUMN "kind" "InvoiceKind" NOT NULL DEFAULT 'STANDARD',
ADD COLUMN "amountPaid" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN "creditApplied" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN "mercuryInvoiceAmount" DECIMAL(12,2);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "receivedAt" DATE NOT NULL,
    "source" "PaymentSource" NOT NULL DEFAULT 'MANUAL',
    "method" TEXT,
    "reference" TEXT,
    "note" TEXT,
    "externalId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "orgId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "recordedById" TEXT,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CreditNote" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "issueDate" DATE NOT NULL,
    "status" "CreditNoteStatus" NOT NULL DEFAULT 'ISSUED',
    "voidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "orgId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "invoiceId" TEXT,
    "createdById" TEXT,

    CONSTRAINT "CreditNote_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CreditApplication" (
    "id" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "orgId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "appliedById" TEXT,

    CONSTRAINT "CreditApplication_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Payment_externalId_key" ON "Payment"("externalId");
CREATE INDEX "Payment_orgId_receivedAt_idx" ON "Payment"("orgId", "receivedAt");
CREATE INDEX "Payment_invoiceId_idx" ON "Payment"("invoiceId");
CREATE INDEX "Payment_clientId_idx" ON "Payment"("clientId");
CREATE UNIQUE INDEX "CreditNote_orgId_number_key" ON "CreditNote"("orgId", "number");
CREATE INDEX "CreditNote_clientId_idx" ON "CreditNote"("clientId");
CREATE INDEX "CreditApplication_clientId_idx" ON "CreditApplication"("clientId");
CREATE INDEX "CreditApplication_invoiceId_idx" ON "CreditApplication"("invoiceId");

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CreditNote" ADD CONSTRAINT "CreditNote_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CreditNote" ADD CONSTRAINT "CreditNote_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CreditNote" ADD CONSTRAINT "CreditNote_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CreditNote" ADD CONSTRAINT "CreditNote_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CreditApplication" ADD CONSTRAINT "CreditApplication_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CreditApplication" ADD CONSTRAINT "CreditApplication_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CreditApplication" ADD CONSTRAINT "CreditApplication_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CreditApplication" ADD CONSTRAINT "CreditApplication_appliedById_fkey" FOREIGN KEY ("appliedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: every invoice already marked paid gets one payment for its total,
-- dated when it was paid (or last changed, for ones paid before paidAt
-- existed). Stripe and Mercury payments keep their ids so a redelivered
-- webhook or the next Mercury poll can't record them twice.
INSERT INTO "Payment" ("id", "amount", "currency", "receivedAt", "source", "method", "reference", "externalId", "orgId", "invoiceId", "clientId")
SELECT
    'bf' || "id",
    "total",
    "currency",
    COALESCE("paidAt", "updatedAt")::date,
    CASE
        WHEN "stripePaymentIntentId" IS NOT NULL THEN 'STRIPE'::"PaymentSource"
        WHEN "mercuryInvoiceId" IS NOT NULL THEN 'MERCURY'::"PaymentSource"
        ELSE 'MANUAL'::"PaymentSource"
    END,
    "paymentMethod",
    COALESCE("stripePaymentIntentId", "mercuryInvoiceId"),
    CASE
        WHEN "stripePaymentIntentId" IS NOT NULL THEN 'stripe:' || "stripePaymentIntentId"
        WHEN "mercuryInvoiceId" IS NOT NULL THEN 'mercury:' || "mercuryInvoiceId"
        ELSE NULL
    END,
    "orgId",
    "id",
    "clientId"
FROM "Invoice"
WHERE "status" = 'PAID' AND "total" > 0;

UPDATE "Invoice" SET "amountPaid" = "total" WHERE "status" = 'PAID' AND "total" > 0;

-- The Stripe payment intent and Mercury invoice on an invoice now only mark
-- a payment still in flight; a paid invoice's live on its Payment instead.
UPDATE "Invoice"
SET "stripePaymentIntentId" = NULL, "mercuryInvoiceId" = NULL, "mercuryInvoiceSlug" = NULL
WHERE "status" = 'PAID';
