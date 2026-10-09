import { NextResponse } from "next/server";
import { syncAllFeeds } from "@/lib/services/calendar";

// Hourly: pull recent meetings from everyone's connected calendars. Same
// shared-secret auth as the other cron routes.
export async function POST(req: Request) {
  const authHeader = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  if (!process.env.CRON_SECRET || authHeader !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json(await syncAllFeeds());
}
