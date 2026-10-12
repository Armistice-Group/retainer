-- AlterTable
ALTER TABLE "Client" ADD COLUMN     "invoiceTimeDetail" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "logoUpdatedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "ClientLogo" (
    "clientId" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "contentType" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientLogo_pkey" PRIMARY KEY ("clientId")
);

-- CreateTable
CREATE TABLE "TimeEntryAttachment" (
    "id" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "fileData" BYTEA,
    "storageKey" TEXT,
    "clientVisible" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "timeEntryId" TEXT NOT NULL,
    "uploadedById" TEXT,

    CONSTRAINT "TimeEntryAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TimeEntryAttachment_timeEntryId_idx" ON "TimeEntryAttachment"("timeEntryId");

-- AddForeignKey
ALTER TABLE "ClientLogo" ADD CONSTRAINT "ClientLogo_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeEntryAttachment" ADD CONSTRAINT "TimeEntryAttachment_timeEntryId_fkey" FOREIGN KEY ("timeEntryId") REFERENCES "TimeEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeEntryAttachment" ADD CONSTRAINT "TimeEntryAttachment_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

