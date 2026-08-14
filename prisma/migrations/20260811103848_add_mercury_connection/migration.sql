-- AlterTable
ALTER TABLE "Client" ADD COLUMN     "mercuryCustomerId" TEXT;

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "mercuryInvoiceId" TEXT,
ADD COLUMN     "mercuryInvoiceSlug" TEXT;

-- CreateTable
CREATE TABLE "MercuryConnection" (
    "id" TEXT NOT NULL,
    "apiToken" TEXT NOT NULL,
    "destinationAccountId" TEXT,
    "destinationAccountName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "orgId" TEXT NOT NULL,
    "connectedById" TEXT,

    CONSTRAINT "MercuryConnection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MercuryConnection_orgId_key" ON "MercuryConnection"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_mercuryInvoiceId_key" ON "Invoice"("mercuryInvoiceId");

-- AddForeignKey
ALTER TABLE "MercuryConnection" ADD CONSTRAINT "MercuryConnection_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MercuryConnection" ADD CONSTRAINT "MercuryConnection_connectedById_fkey" FOREIGN KEY ("connectedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
