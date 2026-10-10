import { NextResponse } from "next/server";
import { handleSchedulingWebhook } from "@/lib/services/scheduling";

// Cal.com and Calendly booking webhooks: /api/webhooks/scheduling/calcom/<token>
// and /api/webhooks/scheduling/calendly/<token>. The token (per org, from
// Settings → Scheduling) finds the connection; the signature is checked with
// that connection's secret. Unknown event types are acknowledged and ignored.
const MAX_BODY = 1024 * 1024;

export async function POST(req: Request, { params }: { params: Promise<{ provider: string; token: string }> }) {
  const { provider, token } = await params;
  const raw = await req.text();
  if (raw.length > MAX_BODY) return NextResponse.json({ error: "Too large" }, { status: 413 });
  const result = await handleSchedulingWebhook(provider, token, raw, req.headers);
  return NextResponse.json(result.body, { status: result.status });
}
