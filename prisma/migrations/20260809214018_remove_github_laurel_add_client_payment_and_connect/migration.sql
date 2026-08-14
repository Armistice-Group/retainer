-- AlterEnum
ALTER TYPE "Plan" ADD VALUE 'GROWTH';

-- DropForeignKey
ALTER TABLE "GithubConnection" DROP CONSTRAINT "GithubConnection_connectedById_fkey";

-- DropForeignKey
ALTER TABLE "GithubConnection" DROP CONSTRAINT "GithubConnection_orgId_fkey";

-- DropForeignKey
ALTER TABLE "LaurelConnection" DROP CONSTRAINT "LaurelConnection_connectedById_fkey";

-- DropForeignKey
ALTER TABLE "LaurelConnection" DROP CONSTRAINT "LaurelConnection_orgId_fkey";

-- DropForeignKey
ALTER TABLE "Repo" DROP CONSTRAINT "Repo_connectionId_fkey";

-- DropForeignKey
ALTER TABLE "Repo" DROP CONSTRAINT "Repo_projectId_fkey";

-- DropForeignKey
ALTER TABLE "Scan" DROP CONSTRAINT "Scan_repoId_fkey";

-- AlterTable
ALTER TABLE "Client" ADD COLUMN     "paymentInstructions" TEXT,
ADD COLUMN     "paymentInstructionsPrivate" BOOLEAN;

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "stripeCheckoutSessionId" TEXT,
ADD COLUMN     "stripePaymentIntentId" TEXT;

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "stripeConnectAccountId" TEXT,
ADD COLUMN     "stripeConnectChargesEnabled" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Project" DROP COLUMN "codeHealthGateEnabled";

-- DropTable
DROP TABLE "GithubConnection";

-- DropTable
DROP TABLE "LaurelConnection";

-- DropTable
DROP TABLE "Repo";

-- DropTable
DROP TABLE "Scan";

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_stripePaymentIntentId_key" ON "Invoice"("stripePaymentIntentId");

-- CreateIndex
CREATE UNIQUE INDEX "Organization_stripeConnectAccountId_key" ON "Organization"("stripeConnectAccountId");
