-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN "paidAt" TIMESTAMP(3);

-- Backfill: the best record of when an existing invoice was paid.
UPDATE "Invoice" SET "paidAt" = "updatedAt" WHERE "status" = 'PAID';
