import { NextResponse } from "next/server";
import { runDueRecurringSchedules } from "@/lib/services/recurring-invoices";
import { notifyNewlyOverdueInvoices } from "@/lib/services/invoices";
import { runDueBillingCycles } from "@/lib/services/billing-cycles";
import { sendOverdueReminders } from "@/lib/services/invoice-delivery";
import { sendWeeklyDigests } from "@/lib/services/weekly-digest";
import { expireEstimates } from "@/lib/services/estimates";
import { sendDeadlineReminders } from "@/lib/services/deadlines";

// Triggered daily by the compose `scheduler` service, not a human —
// authenticated with a shared secret rather than a user session, since
// there's no logged-in actor for a scheduled job to act as. Bundles the daily
// billing housekeeping: retainer invoices, client billing cycles,
// newly-overdue notices, overdue reminder emails to clients, and (Mondays)
// the weekly digest. Plus deadline reminders (tasks due tomorrow, overdue
// tasks, milestones and deliverables).
export async function POST(req: Request) {
  const authHeader = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  if (!process.env.CRON_SECRET || authHeader !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results = await runDueRecurringSchedules();
  const billingCycles = await runDueBillingCycles();
  const newlyOverdueCount = await notifyNewlyOverdueInvoices();
  const reminders = await sendOverdueReminders();
  const digests = await sendWeeklyDigests();
  // Also done whenever an estimate is read; this catches the rest.
  const estimatesExpired = await expireEstimates();
  const deadlines = await sendDeadlineReminders();
  return NextResponse.json({
    ran: results.length,
    results,
    billingCycles,
    newlyOverdueCount,
    remindersSent: reminders.sent,
    digestsSent: digests.sent,
    estimatesExpired,
    deadlines,
  });
}
