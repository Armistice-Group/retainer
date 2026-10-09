import { NextResponse } from "next/server";
import { getConfig } from "@/lib/instance-config";
import { verifyWebhookSignature } from "@/lib/integrations/linear";
import { handleLinearWebhook, type LinearWebhookPayload } from "@/lib/services/linear-sync";

// Linear calls this for Issue and Comment events when webhooks are turned on
// in the instance's Linear OAuth app (Settings → Integrations shows the URL).
// Deliveries are signed with that app's webhook signing secret.
const MAX_AGE_MS = 60_000;

export async function POST(req: Request) {
  const secret = await getConfig("LINEAR_WEBHOOK_SECRET");
  if (!secret) {
    return NextResponse.json({ error: "Linear webhooks aren't set up here." }, { status: 404 });
  }

  const raw = await req.text();
  if (!verifyWebhookSignature(raw, req.headers.get("linear-signature"), secret)) {
    return NextResponse.json({ error: "Bad signature" }, { status: 401 });
  }

  let payload: LinearWebhookPayload & { webhookTimestamp?: number };
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Bad payload" }, { status: 400 });
  }
  // Replay guard: a captured delivery can't be re-sent later.
  if (!payload.webhookTimestamp || Math.abs(Date.now() - payload.webhookTimestamp) > MAX_AGE_MS) {
    return NextResponse.json({ error: "Stale delivery" }, { status: 400 });
  }
  if (!payload.organizationId || !payload.data?.id) {
    return NextResponse.json({ ok: true, handled: false });
  }

  const result = await handleLinearWebhook(payload);
  return NextResponse.json({ ok: true, ...result });
}
