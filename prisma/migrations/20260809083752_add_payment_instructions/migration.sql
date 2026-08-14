-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "paymentInstructions" TEXT,
ADD COLUMN     "paymentInstructionsPrivate" BOOLEAN NOT NULL DEFAULT false;
