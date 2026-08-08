import { NextResponse } from "next/server";
import { runDueRecurringSchedules } from "@/lib/services/recurring-invoices";

// Triggered by an EventBridge Scheduler rule (terraform/modules/ec2), not a
// human — authenticated with a shared secret rather than a user session,
// since there's no logged-in actor for a scheduled job to act as.
export async function POST(req: Request) {
  const authHeader = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  if (!process.env.CRON_SECRET || authHeader !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results = await runDueRecurringSchedules();
  return NextResponse.json({ ran: results.length, results });
}
