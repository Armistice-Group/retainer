import { NextResponse } from "next/server";
import { syncAllScheduling } from "@/lib/services/scheduling";

// Hourly: refreshes Cal.com/Calendly event types, pulls bookings for Calendly
// accounts without webhooks, and deletes draft clients discarded more than
// 30 days ago. Same shared-secret auth as the other cron routes.
export async function POST(req: Request) {
  const authHeader = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  if (!process.env.CRON_SECRET || authHeader !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json(await syncAllScheduling());
}
