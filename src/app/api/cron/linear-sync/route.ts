import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { pullLinearIssues } from "@/lib/services/linear-sync";

// Hourly catch-up for every project linked to Linear: picks up issue and
// comment changes even where webhooks aren't set up (or a delivery was
// missed), and sends any task that failed to push. Same shared-secret auth
// as the other cron routes.
export async function POST(req: Request) {
  const authHeader = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  if (!process.env.CRON_SECRET || authHeader !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const links = await prisma.externalProjectLink.findMany({
    where: { source: "linear", project: { status: { in: ["ACTIVE", "ON_HOLD"] } } },
    select: { projectId: true },
  });
  let synced = 0;
  let failed = 0;
  for (const link of links) {
    try {
      await pullLinearIssues(link.projectId);
      synced++;
    } catch (err) {
      failed++;
      console.warn("[linear] Scheduled sync failed", link.projectId, err);
    }
  }
  return NextResponse.json({ synced, failed });
}
