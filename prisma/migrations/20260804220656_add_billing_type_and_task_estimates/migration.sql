
-- CreateEnum
CREATE TYPE "BillingType" AS ENUM ('HOURLY', 'FLAT_FEE', 'MILESTONE');

-- AlterTable
ALTER TABLE "LinearConnection" ADD COLUMN     "scope" TEXT;

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "billingType" "BillingType" NOT NULL DEFAULT 'HOURLY',
ADD COLUMN     "flatFeeAmount" DECIMAL(12,2);

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "estimatedHours" DECIMAL(6,2);

