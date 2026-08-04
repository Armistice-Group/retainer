
-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "budgetHours" DECIMAL(7,2),
ADD COLUMN     "confidential" BOOLEAN NOT NULL DEFAULT false;

