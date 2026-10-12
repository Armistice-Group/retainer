-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "clockRoundingMinutes" INTEGER NOT NULL DEFAULT 15;

-- AlterTable
ALTER TABLE "Client" ADD COLUMN     "requireClockTimes" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "TimeEntry" ADD COLUMN     "endMinute" INTEGER,
ADD COLUMN     "startMinute" INTEGER;

-- Start and end come as a pair, each a minute of the day.
ALTER TABLE "TimeEntry" ADD CONSTRAINT "TimeEntry_clock_minutes_check" CHECK (
  ("startMinute" IS NULL AND "endMinute" IS NULL)
  OR ("startMinute" BETWEEN 0 AND 1439 AND "endMinute" BETWEEN 0 AND 1439)
);
