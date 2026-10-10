-- Task due dates, deliverables (non-billable milestones), scheduled invoice
-- sending, deadline reminders and personal calendar subscriptions.

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'TASK_DUE_SOON';
ALTER TYPE "NotificationType" ADD VALUE 'DEADLINE_OVERDUE';
ALTER TYPE "NotificationType" ADD VALUE 'INVOICE_SEND_FAILED';

-- AlterTable
ALTER TABLE "Task" ADD COLUMN "dueDate" DATE,
ADD COLUMN "dueSoonNotifiedAt" TIMESTAMP(3),
ADD COLUMN "overdueNotifiedAt" TIMESTAMP(3);

ALTER TABLE "Milestone" ALTER COLUMN "amount" SET DEFAULT 0,
ADD COLUMN "billable" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "overdueNotifiedAt" TIMESTAMP(3);

ALTER TABLE "Invoice" ADD COLUMN "scheduledSendAt" TIMESTAMP(3),
ADD COLUMN "scheduledSendById" TEXT,
ADD COLUMN "scheduledSendError" TEXT;

-- CreateTable
CREATE TABLE "CalendarSubscription" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastFetchedAt" TIMESTAMP(3),
    "orgId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "CalendarSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Task_dueDate_idx" ON "Task"("dueDate");
CREATE INDEX "Invoice_scheduledSendAt_idx" ON "Invoice"("scheduledSendAt");
CREATE UNIQUE INDEX "CalendarSubscription_tokenHash_key" ON "CalendarSubscription"("tokenHash");
CREATE UNIQUE INDEX "CalendarSubscription_userId_orgId_key" ON "CalendarSubscription"("userId", "orgId");

-- AddForeignKey
ALTER TABLE "CalendarSubscription" ADD CONSTRAINT "CalendarSubscription_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CalendarSubscription" ADD CONSTRAINT "CalendarSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
