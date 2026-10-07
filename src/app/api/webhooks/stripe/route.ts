import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { getStripe } from "@/lib/stripe";
import { notifyInvoiceStatusChange } from "@/lib/services/invoices";

// Records invoice payments collected through Stripe Connect. Must read the raw body (not req.json()) for signature verification to work.
export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[stripe webhook] STRIPE_WEBHOOK_SECRET is not configured.");
    return NextResponse.json({ error: "Webhook not configured" }, { status: 500 });
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  const body = await req.text();

  let event: Stripe.Event;
  try {
    event = await getStripe().webhooks.constructEventAsync(body, signature, secret);
  } catch (err) {
    console.error("[stripe webhook] Signature verification failed", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    // Invoice "Pay now" checkout (Stripe Connect, destination charge on the
    // platform account).
    if (session.mode === "payment" && session.metadata?.invoiceId) {
      await handleInvoicePaymentCompleted(session);
    }
  }

  return NextResponse.json({ received: true });
}

async function handleInvoicePaymentCompleted(session: Stripe.Checkout.Session) {
  const invoiceId = session.metadata?.invoiceId;
  const paymentIntentId =
    typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id;
  if (!invoiceId || !paymentIntentId) return;

  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: { client: true, org: true },
  });
  // Idempotency: a webhook can be retried/redelivered — if this invoice
  // already recorded a (possibly different) payment intent, or is already
  // paid, don't re-run the side effects a second time.
  if (!invoice || invoice.status === "PAID" || invoice.stripePaymentIntentId) return;

  await prisma.invoice.update({
    where: { id: invoice.id },
    data: {
      status: "PAID",
      stripeCheckoutSessionId: session.id,
      stripePaymentIntentId: paymentIntentId,
    },
  });

  await notifyInvoiceStatusChange(invoice.org, invoice, "PAID");
}
