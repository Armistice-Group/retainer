-- CreateTable
CREATE TABLE "AgreementConnection" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "accountId" TEXT,
    "accountName" TEXT,
    "baseUrl" TEXT,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "clientId" TEXT,
    "clientSecret" TEXT,
    "actAsEmail" TEXT,
    "syncCursor" TIMESTAMP(3),
    "lastSyncedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "connectedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "orgId" TEXT NOT NULL,

    CONSTRAINT "AgreementConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Agreement" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "signedAt" TIMESTAMP(3),
    "signers" JSONB NOT NULL DEFAULT '[]',
    "externalUrl" TEXT,
    "fileName" TEXT,
    "fileData" BYTEA,
    "storageKey" TEXT,
    "contentType" TEXT,
    "sizeBytes" INTEGER,
    "suggestedClientId" TEXT,
    "dismissedAt" TIMESTAMP(3),
    "dismissedById" TEXT,
    "linkedAt" TIMESTAMP(3),
    "linkedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "orgId" TEXT NOT NULL,
    "clientId" TEXT,
    "projectId" TEXT,

    CONSTRAINT "Agreement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AgreementConnection_orgId_provider_key" ON "AgreementConnection"("orgId", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "Agreement_orgId_provider_externalId_key" ON "Agreement"("orgId", "provider", "externalId");

-- CreateIndex
CREATE INDEX "Agreement_orgId_clientId_idx" ON "Agreement"("orgId", "clientId");

-- CreateIndex
CREATE INDEX "Agreement_clientId_idx" ON "Agreement"("clientId");

-- CreateIndex
CREATE INDEX "Agreement_projectId_idx" ON "Agreement"("projectId");

-- AddForeignKey
ALTER TABLE "AgreementConnection" ADD CONSTRAINT "AgreementConnection_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Agreement" ADD CONSTRAINT "Agreement_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Agreement" ADD CONSTRAINT "Agreement_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Agreement" ADD CONSTRAINT "Agreement_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
