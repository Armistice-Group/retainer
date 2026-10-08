-- DropIndex
DROP INDEX "ExternalProjectLink_source_externalId_key";

-- AlterTable
ALTER TABLE "ExternalProjectLink" ADD COLUMN     "labelIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "labelNames" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "lastSyncedAt" TIMESTAMP(3),
ADD COLUMN     "linearProjectId" TEXT,
ADD COLUMN     "linearProjectName" TEXT,
ADD COLUMN     "pushChanges" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "LinearConnection" ADD COLUMN     "accessTokenExpiresAt" TIMESTAMP(3),
ADD COLUMN     "refreshToken" TEXT;

-- CreateIndex
CREATE INDEX "ExternalProjectLink_source_externalId_idx" ON "ExternalProjectLink"("source", "externalId");

