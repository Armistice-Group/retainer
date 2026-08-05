-- CreateEnum
CREATE TYPE "PaymentTerms" AS ENUM ('DUE_ON_RECEIPT', 'NET15', 'NET30', 'NET45', 'NET60', 'NET90', 'CUSTOM');

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "paymentMethod" TEXT,
ADD COLUMN     "paymentTerms" "PaymentTerms" NOT NULL DEFAULT 'NET30',
ADD COLUMN     "poNumber" TEXT;

