-- Cal.com / Calendly scheduling: connections, event type mapping, bookings,
-- draft clients (ClientStatus LEAD), NEW_LEAD alerts, booking links, and
-- upcoming calendar meetings (CalendarEventStatus UPCOMING).

-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('SCHEDULED', 'CANCELLED', 'RESCHEDULED', 'NO_SHOW');

-- AlterEnum
ALTER TYPE "CalendarEventStatus" ADD VALUE 'UPCOMING';

-- AlterEnum
ALTER TYPE "ClientStatus" ADD VALUE 'LEAD';

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'NEW_LEAD';

-- AlterTable
ALTER TABLE "CalendarEvent" ADD COLUMN     "bookingId" TEXT;

-- AlterTable
ALTER TABLE "Client" ADD COLUMN     "bookingUrl" TEXT,
ADD COLUMN     "leadBookedAt" TIMESTAMP(3),
ADD COLUMN     "leadDiscardedAt" TIMESTAMP(3),
ADD COLUMN     "leadSource" TEXT;

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "bookingUrl" TEXT;

-- CreateTable
CREATE TABLE "SchedulingConnection" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "baseUrl" TEXT,
    "apiToken" TEXT NOT NULL,
    "accountName" TEXT,
    "accountEmail" TEXT,
    "externalUserId" TEXT,
    "externalOrgId" TEXT,
    "webhookTokenHash" TEXT NOT NULL,
    "webhookToken" TEXT NOT NULL,
    "webhookSecret" TEXT NOT NULL,
    "webhookId" TEXT,
    "mode" TEXT NOT NULL DEFAULT 'WEBHOOK',
    "companyQuestion" TEXT,
    "lastWebhookAt" TIMESTAMP(3),
    "lastSyncedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "connectedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "orgId" TEXT NOT NULL,

    CONSTRAINT "SchedulingConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchedulingEventType" (
    "id" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT,
    "bookingUrl" TEXT,
    "purpose" TEXT NOT NULL DEFAULT 'INTAKE',
    "billable" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "orgId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "projectId" TEXT,

    CONSTRAINT "SchedulingEventType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Booking" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "externalEventId" TEXT,
    "title" TEXT NOT NULL,
    "eventTypeName" TEXT,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "status" "BookingStatus" NOT NULL DEFAULT 'SCHEDULED',
    "inviteeName" TEXT,
    "inviteeEmail" TEXT,
    "inviteePhone" TEXT,
    "timeZone" TEXT,
    "joinUrl" TEXT,
    "location" TEXT,
    "answers" JSONB NOT NULL DEFAULT '[]',
    "cancelReason" TEXT,
    "hostEmail" TEXT,
    "createdLead" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "orgId" TEXT NOT NULL,
    "connectionId" TEXT,
    "eventTypeId" TEXT,
    "hostUserId" TEXT,
    "clientId" TEXT,
    "contactId" TEXT,

    CONSTRAINT "Booking_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SchedulingConnection_webhookTokenHash_key" ON "SchedulingConnection"("webhookTokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "SchedulingConnection_orgId_provider_key" ON "SchedulingConnection"("orgId", "provider");

-- CreateIndex
CREATE INDEX "SchedulingEventType_orgId_idx" ON "SchedulingEventType"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "SchedulingEventType_connectionId_externalId_key" ON "SchedulingEventType"("connectionId", "externalId");

-- CreateIndex
CREATE INDEX "Booking_orgId_startAt_idx" ON "Booking"("orgId", "startAt");

-- CreateIndex
CREATE INDEX "Booking_clientId_idx" ON "Booking"("clientId");

-- CreateIndex
CREATE INDEX "Booking_hostUserId_startAt_idx" ON "Booking"("hostUserId", "startAt");

-- CreateIndex
CREATE UNIQUE INDEX "Booking_orgId_provider_externalId_key" ON "Booking"("orgId", "provider", "externalId");

-- CreateIndex
CREATE INDEX "CalendarEvent_bookingId_idx" ON "CalendarEvent"("bookingId");

-- AddForeignKey
ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchedulingConnection" ADD CONSTRAINT "SchedulingConnection_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchedulingEventType" ADD CONSTRAINT "SchedulingEventType_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchedulingEventType" ADD CONSTRAINT "SchedulingEventType_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "SchedulingConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchedulingEventType" ADD CONSTRAINT "SchedulingEventType_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "SchedulingConnection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_eventTypeId_fkey" FOREIGN KEY ("eventTypeId") REFERENCES "SchedulingEventType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_hostUserId_fkey" FOREIGN KEY ("hostUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

