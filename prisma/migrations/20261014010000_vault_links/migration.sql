-- CreateTable
CREATE TABLE "VaultLink" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "note" TEXT,
    "url" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "itemKind" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "orgId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "projectId" TEXT,

    CONSTRAINT "VaultLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VaultLink_orgId_idx" ON "VaultLink"("orgId");

-- CreateIndex
CREATE INDEX "VaultLink_clientId_idx" ON "VaultLink"("clientId");

-- CreateIndex
CREATE INDEX "VaultLink_projectId_idx" ON "VaultLink"("projectId");

-- AddForeignKey
ALTER TABLE "VaultLink" ADD CONSTRAINT "VaultLink_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VaultLink" ADD CONSTRAINT "VaultLink_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VaultLink" ADD CONSTRAINT "VaultLink_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
