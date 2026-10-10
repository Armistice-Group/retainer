-- CreateEnum
CREATE TYPE "DocumentSource" AS ENUM ('UPLOAD', 'LINK', 'GOOGLE_DRIVE', 'DROPBOX', 'ONEDRIVE', 'NOTION', 'BOX');

-- CreateEnum
CREATE TYPE "DocumentAudience" AS ENUM ('INTERNAL', 'CLIENT');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ClientDocumentType" ADD VALUE 'NDA';
ALTER TYPE "ClientDocumentType" ADD VALUE 'SOW';
ALTER TYPE "ClientDocumentType" ADD VALUE 'PROPOSAL';
ALTER TYPE "ClientDocumentType" ADD VALUE 'REPORT';
ALTER TYPE "ClientDocumentType" ADD VALUE 'REFERENCE';

-- AlterTable
ALTER TABLE "ClientDocument" ADD COLUMN     "audience" "DocumentAudience" NOT NULL DEFAULT 'INTERNAL',
ADD COLUMN     "externalId" TEXT,
ADD COLUMN     "externalKind" TEXT,
ADD COLUMN     "externalModifiedAt" TIMESTAMP(3),
ADD COLUMN     "externalUrl" TEXT,
ADD COLUMN     "projectId" TEXT,
ADD COLUMN     "sizeBytes" INTEGER,
ADD COLUMN     "source" "DocumentSource" NOT NULL DEFAULT 'UPLOAD',
ADD COLUMN     "storageKey" TEXT,
ALTER COLUMN "fileData" DROP NOT NULL,
ALTER COLUMN "contentType" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "ClientDocument_projectId_idx" ON "ClientDocument"("projectId");

-- AddForeignKey
ALTER TABLE "ClientDocument" ADD CONSTRAINT "ClientDocument_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

