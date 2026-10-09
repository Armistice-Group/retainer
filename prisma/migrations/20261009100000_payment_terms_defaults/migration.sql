-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "defaultPaymentTerms" "PaymentTerms" NOT NULL DEFAULT 'NET30';

-- AlterTable
ALTER TABLE "Client" ADD COLUMN     "paymentTerms" "PaymentTerms";

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "paymentTerms" "PaymentTerms";
