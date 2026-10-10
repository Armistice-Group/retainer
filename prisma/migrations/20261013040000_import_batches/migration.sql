-- CreateTable
CREATE TABLE "ImportBatch" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "rowCount" INTEGER NOT NULL DEFAULT 0,
    "entriesCreated" INTEGER NOT NULL DEFAULT 0,
    "clientsCreated" INTEGER NOT NULL DEFAULT 0,
    "projectsCreated" INTEGER NOT NULL DEFAULT 0,
    "rowsSkipped" INTEGER NOT NULL DEFAULT 0,
    "createdClientIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdProjectIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdProjectMemberIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdById" TEXT,
    "undoneAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "orgId" TEXT NOT NULL,

    CONSTRAINT "ImportBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportRecord" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "rowHash" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "timeEntryId" TEXT NOT NULL,

    CONSTRAINT "ImportRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ImportBatch_orgId_createdAt_idx" ON "ImportBatch"("orgId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ImportRecord_timeEntryId_key" ON "ImportRecord"("timeEntryId");

-- CreateIndex
CREATE INDEX "ImportRecord_batchId_idx" ON "ImportRecord"("batchId");

-- CreateIndex
CREATE UNIQUE INDEX "ImportRecord_orgId_rowHash_key" ON "ImportRecord"("orgId", "rowHash");

-- AddForeignKey
ALTER TABLE "ImportBatch" ADD CONSTRAINT "ImportBatch_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportRecord" ADD CONSTRAINT "ImportRecord_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "ImportBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportRecord" ADD CONSTRAINT "ImportRecord_timeEntryId_fkey" FOREIGN KEY ("timeEntryId") REFERENCES "TimeEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;
