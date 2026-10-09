-- AlterTable
ALTER TABLE "LinearConnection" ADD COLUMN     "lastWebhookAt" TIMESTAMP(3),
ADD COLUMN     "linearOrgId" TEXT;

-- AlterTable
ALTER TABLE "TaskComment" ADD COLUMN     "externalAuthor" TEXT,
ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'app';

-- CreateIndex
CREATE INDEX "LinearConnection_linearOrgId_idx" ON "LinearConnection"("linearOrgId");

-- CreateIndex
CREATE UNIQUE INDEX "TaskComment_externalId_key" ON "TaskComment"("externalId");

