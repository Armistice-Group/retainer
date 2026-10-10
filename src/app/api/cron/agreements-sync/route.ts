import { NextResponse } from "next/server";
import { syncAllAgreements } from "@/lib/services/agreements";

// Hourly: pulls newly completed agreements from every connected DocuSign,
// Documenso and Ironclad account. Read-only and idempotent. Same
// shared-secret auth as the other cron routes.
export async function POST(req: Request) {
  const authHeader = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  if (!process.env.CRON_SECRET || authHeader !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json(await syncAllAgreements());
}
