-- AlterTable
ALTER TABLE "Client" ADD COLUMN "attachInvoicePdf" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN "timeDetail" BOOLEAN;
