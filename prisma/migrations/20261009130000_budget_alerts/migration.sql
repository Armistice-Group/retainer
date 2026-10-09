-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'BUDGET_ALERT';

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "budgetAlertLevel" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "overEstimateAlertedAt" TIMESTAMP(3);

