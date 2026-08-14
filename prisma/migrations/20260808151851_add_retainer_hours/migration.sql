-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "retainerHoursIncluded" DECIMAL(8,2);

-- AlterTable
ALTER TABLE "RecurringInvoiceSchedule" ADD COLUMN     "retainerHours" DECIMAL(8,2);
