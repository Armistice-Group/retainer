import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { getConfig } from "@/lib/instance-config";
import { handleInvoiceCheckoutEvent, isInvoiceCheckoutEvent } from "@/lib/services/stripe-invoice-webhook";

// Records invoice payments collected through Stripe Connect. Must read the raw body (not req.json()) for signature verification to work.
export async function POST(req: Request) {
  const secret = await getConfig("STRIPE_WEBHOOK_SECRET");
  if (!secret) {
    console.error("[stripe webhook] No webhook signing secret configured (Settings → Payments or STRIPE_WEBHOOK_SECRET).");
    return NextResponse.json({ error: "Webhook not configured" }, { status: 500 });
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  const body = await req.text();

  let event: Stripe.Event;
  try {
    event = await (await getStripe()).webhooks.constructEventAsync(body, signature, secret);
  } catch (err) {
    console.error("[stripe webhook] Signature verification failed", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  // Invoice "Pay now" checkout: records the payment (or tracks a bank
  // payment that's clearing, or one that failed).
  if (isInvoiceCheckoutEvent(event.type)) {
    await handleInvoiceCheckoutEvent(event.type, event.data.object as Stripe.Checkout.Session);
  }

  return NextResponse.json({ received: true });
}

