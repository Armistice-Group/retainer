-- AlterTable
ALTER TABLE "Client" ADD COLUMN     "billingAddress" TEXT,
ADD COLUMN     "billingEmail" TEXT;

-- AlterTable
ALTER TABLE "Contact" ADD COLUMN     "contactRole" TEXT,
ADD COLUMN     "receivesInvoices" BOOLEAN NOT NULL DEFAULT false;
