import { NextResponse } from "next/server";
import { syncMercuryInvoiceStatuses } from "@/lib/services/mercury-sync";
import { sendScheduledInvoices } from "@/lib/services/scheduled-invoices";

// Triggered hourly by the compose `scheduler` service, same shared-secret
// auth as the other cron routes. Runs more often than the daily billing
// housekeeping job since a client who just paid expects their
// invoice to flip to PAID within the hour, not by tomorrow. Also sends
// draft invoices scheduled to go out by now (same hourly cadence, so an
// invoice scheduled for 9:00 goes out by 10:00).
export async function POST(req: Request) {
  const authHeader = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  if (!process.env.CRON_SECRET || authHeader !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // First, and on its own: a Mercury problem mustn't hold up scheduled sends.
  const scheduledInvoices = await sendScheduledInvoices().catch((err) => {
    console.error("[cron] Scheduled invoice sends failed", err);
    return { error: "failed" };
  });
  const result = await syncMercuryInvoiceStatuses();
  return NextResponse.json({ ...result, scheduledInvoices });
}
