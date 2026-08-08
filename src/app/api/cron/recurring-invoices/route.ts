import { NextResponse } from "next/server";
import { runDueRecurringSchedules } from "@/lib/services/recurring-invoices";
import { notifyNewlyOverdueInvoices } from "@/lib/services/invoices";

// Triggered by an EventBridge Scheduler rule (terraform/modules/ec2), not a
// human — authenticated with a shared secret rather than a user session,
// since there's no logged-in actor for a scheduled job to act as. Bundles
// both daily billing housekeeping tasks (generate due retainer invoices,
// flag newly-overdue ones) into one job rather than provisioning a second
// EventBridge Schedule + API destination for what's a few extra ms of work.
export async function POST(req: Request) {
  const authHeader = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  if (!process.env.CRON_SECRET || authHeader !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results = await runDueRecurringSchedules();
  const newlyOverdueCount = await notifyNewlyOverdueInvoices();
  return NextResponse.json({ ran: results.length, results, newlyOverdueCount });
}
