import { NextResponse } from "next/server";
import { catchUpFiling } from "@/lib/services/filing";

// Hourly: file anything that didn't reach the org's filing folder when it
// happened (or changed since). Same shared-secret auth as the other jobs.
export async function POST(req: Request) {
  const authHeader = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  if (!process.env.CRON_SECRET || authHeader !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json(await catchUpFiling());
}
