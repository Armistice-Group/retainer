import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { getStripe } from "@/lib/stripe";
import { getConfig } from "@/lib/instance-config";
import { notifyInvoiceStatusChange } from "@/lib/services/invoices";
import { sendAlert } from "@/lib/alerts";
import { formatCurrency } from "@/lib/format";

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

  // Invoice "Pay now" checkout (Stripe Connect, destination charge on the
  // platform account). Cards are paid at checkout.session.completed; bank
  // debits (ACH) complete "unpaid" and settle days later with
  // async_payment_succeeded or async_payment_failed.
  if (
    event.type === "checkout.session.completed" ||
    event.type === "checkout.session.async_payment_succeeded" ||
    event.type === "checkout.session.async_payment_failed"
  ) {
    const session = event.data.object as Stripe.Checkout.Session;
    if (session.mode === "payment" && session.metadata?.invoiceId) {
      if (event.type === "checkout.session.async_payment_failed") {
        await handleInvoicePaymentFailed(session);
      } else if (session.payment_status === "paid") {
        await handleInvoicePaid(session);
      } else if (event.type === "checkout.session.completed") {
        await handleInvoicePaymentProcessing(session);
      }
    }
  }

  return NextResponse.json({ received: true });
}

function paymentIntentIdOf(session: Stripe.Checkout.Session) {
  return typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id;
}

// Each handler below is safe to run twice (Stripe retries and redelivers):
// the conditional updateMany only matches once, and side effects only run
// when it did.

async function handleInvoicePaid(session: Stripe.Checkout.Session) {
  const invoiceId = session.metadata?.invoiceId;
  const paymentIntentId = paymentIntentIdOf(session);
  if (!invoiceId || !paymentIntentId) return;

  // Not if already paid, or if a different payment was recorded for it.
  const { count } = await prisma.invoice.updateMany({
    where: {
      id: invoiceId,
      status: { not: "PAID" },
      OR: [{ stripePaymentIntentId: null }, { stripePaymentIntentId: paymentIntentId }],
    },
    data: {
      status: "PAID",
      paidAt: new Date(),
      stripeCheckoutSessionId: session.id,
      stripePaymentIntentId: paymentIntentId,
    },
  });
  if (!count) return;

  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: { client: true, org: true },
  });
  if (invoice) await notifyInvoiceStatusChange(invoice.org, invoice, "PAID");
}

/** A bank payment was submitted and is clearing: the invoice stays open but
 * remembers the payment, so "Pay now" isn't offered again meanwhile. */
async function handleInvoicePaymentProcessing(session: Stripe.Checkout.Session) {
  const invoiceId = session.metadata?.invoiceId;
  const paymentIntentId = paymentIntentIdOf(session);
  if (!invoiceId || !paymentIntentId) return;

  // A failure that arrived out of order already settled this one.
  const failed = await prisma.invoiceEvent.findFirst({
    where: { invoiceId, type: "PAYMENT_FAILED", detail: paymentIntentId },
  });
  if (failed) return;

  const { count } = await prisma.invoice.updateMany({
    where: { id: invoiceId, status: { not: "PAID" }, stripePaymentIntentId: null },
    data: { stripeCheckoutSessionId: session.id, stripePaymentIntentId: paymentIntentId },
  });
  if (!count) return;
  await prisma.invoiceEvent.create({
    data: { invoiceId, type: "PAYMENT_PROCESSING", detail: paymentIntentId },
  });
}

/** A bank payment bounced: forget it so the client can pay again, reopening
 * the invoice if it had been marked paid, and tell the org. */
async function handleInvoicePaymentFailed(session: Stripe.Checkout.Session) {
  const invoiceId = session.metadata?.invoiceId;
  const paymentIntentId = paymentIntentIdOf(session);
  if (!invoiceId || !paymentIntentId) return;

  const already = await prisma.invoiceEvent.findFirst({
    where: { invoiceId, type: "PAYMENT_FAILED", detail: paymentIntentId },
  });
  if (already) return;

  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: { client: true },
  });
  if (!invoice) return;

  // Only undo this payment — not a different one recorded since.
  if (invoice.stripePaymentIntentId === paymentIntentId) {
    await prisma.invoice.update({
      where: { id: invoice.id },
      data: {
        stripePaymentIntentId: null,
        stripeCheckoutSessionId: null,
        ...(invoice.status === "PAID" ? { status: "SENT", paidAt: null } : {}),
      },
    });
  }
  await prisma.invoiceEvent.create({
    data: { invoiceId, type: "PAYMENT_FAILED", detail: paymentIntentId },
  });

  const reopened = invoice.status === "PAID" && invoice.stripePaymentIntentId === paymentIntentId;
  await sendAlert({
    orgId: invoice.orgId,
    event: "INVOICE_PAID",
    message: `The bank payment for invoice ${invoice.number} from ${invoice.client.name} failed (${formatCurrency(invoice.total, invoice.currency)})${reopened ? " — it's marked unpaid again" : ""}.`,
    link: `/invoices/${invoice.id}`,
  });
}
