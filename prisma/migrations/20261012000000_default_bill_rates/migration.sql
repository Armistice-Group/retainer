-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "defaultBillRate" DECIMAL(10,2);

-- AlterTable
ALTER TABLE "Membership" ADD COLUMN     "billRate" DECIMAL(10,2);
