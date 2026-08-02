
-- CreateTable
CREATE TABLE "LinearConnection" (
    "id" TEXT NOT NULL,
    "workspaceName" TEXT,
    "accessToken" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "orgId" TEXT NOT NULL,
    "connectedById" TEXT,

    CONSTRAINT "LinearConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExternalProjectLink" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "externalName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "projectId" TEXT NOT NULL,

    CONSTRAINT "ExternalProjectLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExternalTaskLink" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "externalUrl" TEXT,
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "taskId" TEXT NOT NULL,

    CONSTRAINT "ExternalTaskLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExternalTimeEntryLink" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "timeEntryId" TEXT NOT NULL,

    CONSTRAINT "ExternalTimeEntryLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LinearConnection_orgId_key" ON "LinearConnection"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalProjectLink_projectId_key" ON "ExternalProjectLink"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalProjectLink_source_externalId_key" ON "ExternalProjectLink"("source", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalTaskLink_taskId_key" ON "ExternalTaskLink"("taskId");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalTaskLink_source_externalId_key" ON "ExternalTaskLink"("source", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalTimeEntryLink_timeEntryId_key" ON "ExternalTimeEntryLink"("timeEntryId");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalTimeEntryLink_source_externalId_key" ON "ExternalTimeEntryLink"("source", "externalId");

-- AddForeignKey
ALTER TABLE "LinearConnection" ADD CONSTRAINT "LinearConnection_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LinearConnection" ADD CONSTRAINT "LinearConnection_connectedById_fkey" FOREIGN KEY ("connectedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalProjectLink" ADD CONSTRAINT "ExternalProjectLink_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalTaskLink" ADD CONSTRAINT "ExternalTaskLink_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalTimeEntryLink" ADD CONSTRAINT "ExternalTimeEntryLink_timeEntryId_fkey" FOREIGN KEY ("timeEntryId") REFERENCES "TimeEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

