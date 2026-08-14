import { NextResponse } from "next/server";
import { syncMercuryInvoiceStatuses } from "@/lib/services/mercury-sync";

// Triggered by an EventBridge Scheduler rule (terraform/main.tf), same
// shared-secret auth as the other cron routes. Runs more often than the
// daily billing housekeeping job since a client who just paid expects their
// invoice to flip to PAID within the hour, not by tomorrow.
export async function POST(req: Request) {
  const authHeader = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  if (!process.env.CRON_SECRET || authHeader !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await syncMercuryInvoiceStatuses();
  return NextResponse.json(result);
}
