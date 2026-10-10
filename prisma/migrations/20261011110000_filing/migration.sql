-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "fileDocuments" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "fileInvoices" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "filingConnectionId" TEXT,
ADD COLUMN     "filingLastError" TEXT,
ADD COLUMN     "filingProvider" TEXT,
ADD COLUMN     "filingRootId" TEXT,
ADD COLUMN     "filingRootName" TEXT,
ADD COLUMN     "filingRootUrl" TEXT;

-- CreateTable
CREATE TABLE "FiledCopy" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "externalUrl" TEXT,
    "filedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "orgId" TEXT NOT NULL,

    CONSTRAINT "FiledCopy_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FiledCopy_orgId_idx" ON "FiledCopy"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "FiledCopy_kind_sourceId_provider_key" ON "FiledCopy"("kind", "sourceId", "provider");

-- AddForeignKey
ALTER TABLE "FiledCopy" ADD CONSTRAINT "FiledCopy_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

