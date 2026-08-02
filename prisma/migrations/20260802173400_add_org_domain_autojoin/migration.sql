
-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "autoJoinDomain" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "domain" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Organization_domain_key" ON "Organization"("domain");

