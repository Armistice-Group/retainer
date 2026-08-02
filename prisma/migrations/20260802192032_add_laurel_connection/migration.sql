
-- CreateTable
CREATE TABLE "LaurelConnection" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "clientSecret" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "orgId" TEXT NOT NULL,
    "connectedById" TEXT,

    CONSTRAINT "LaurelConnection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LaurelConnection_orgId_key" ON "LaurelConnection"("orgId");

-- AddForeignKey
ALTER TABLE "LaurelConnection" ADD CONSTRAINT "LaurelConnection_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LaurelConnection" ADD CONSTRAINT "LaurelConnection_connectedById_fkey" FOREIGN KEY ("connectedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

