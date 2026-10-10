import "server-only";
import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { sendAlert } from "@/lib/alerts";
import { formatCurrency } from "@/lib/format";
import { deletePayment, PaymentError, recordPayment } from "@/lib/services/payments";

// Invoice "Pay now" checkout (Stripe Connect, destination charge on the
// platform account). Cards are paid at checkout.session.completed; bank
// debits (ACH) complete "unpaid" and settle days later with
// async_payment_succeeded or async_payment_failed.
//
// Each handler is safe to run twice (Stripe retries and redelivers): a
// payment is keyed on its payment intent ("stripe:<pi>"), so it's recorded
// once however often the event arrives.

export type InvoiceCheckoutEventType =
  | "checkout.session.completed"
  | "checkout.session.async_payment_succeeded"
  | "checkout.session.async_payment_failed";

export function isInvoiceCheckoutEvent(type: string): type is InvoiceCheckoutEventType {
  return (
    type === "checkout.session.completed" ||
    type === "checkout.session.async_payment_succeeded" ||
    type === "checkout.session.async_payment_failed"
  );
}

export async function handleInvoiceCheckoutEvent(
  type: InvoiceCheckoutEventType,
  session: Stripe.Checkout.Session
) {
  if (session.mode !== "payment" || !session.metadata?.invoiceId) return;
  if (type === "checkout.session.async_payment_failed") {
    await handleInvoicePaymentFailed(session);
  } else if (session.payment_status === "paid") {
    await handleInvoicePaid(session);
  } else if (type === "checkout.session.completed") {
    await handleInvoicePaymentProcessing(session);
  }
}

function paymentIntentIdOf(session: Stripe.Checkout.Session) {
  return typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id;
}

const externalIdFor = (paymentIntentId: string) => `stripe:${paymentIntentId}`;

/** Records what Stripe actually collected (the balance at checkout) as a
 * payment. More than is now due — someone recorded a payment by hand while
 * the client was at checkout — is kept and becomes client credit. */
async function handleInvoicePaid(session: Stripe.Checkout.Session) {
  const invoiceId = session.metadata?.invoiceId;
  const paymentIntentId = paymentIntentIdOf(session);
  if (!invoiceId || !paymentIntentId) return;

  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    select: { id: true, orgId: true, currency: true },
  });
  if (!invoice) return;
  const amount = (session.amount_total ?? 0) / 100;
  if (amount <= 0) return;
  if (session.currency && session.currency.toUpperCase() !== invoice.currency.toUpperCase()) {
    console.error(`[stripe webhook] Currency mismatch for invoice ${invoiceId}: ${session.currency}`);
    return;
  }

  try {
    await recordPayment(
      { orgId: invoice.orgId, actorId: null },
      {
        invoiceId,
        amount,
        source: "STRIPE",
        method: "Paid online (Stripe)",
        reference: paymentIntentId,
        externalId: externalIdFor(paymentIntentId),
        allowOverpayment: true,
      }
    );
  } catch (err) {
    if (err instanceof PaymentError) {
      console.error(`[stripe webhook] Couldn't record payment for invoice ${invoiceId}: ${err.message}`);
      return;
    }
    throw err;
  }

  // No longer in flight: clear the marker so "Pay now" works again if a
  // balance is ever left (e.g. a payment recorded by mistake is deleted).
  await prisma.invoice.updateMany({
    where: { id: invoiceId, stripePaymentIntentId: paymentIntentId },
    data: { stripePaymentIntentId: null },
  });
}

/** A bank payment was submitted and is clearing: the invoice stays open but
 * remembers the payment, so "Pay now" isn't offered again meanwhile. */
async function handleInvoicePaymentProcessing(session: Stripe.Checkout.Session) {
  const invoiceId = session.metadata?.invoiceId;
  const paymentIntentId = paymentIntentIdOf(session);
  if (!invoiceId || !paymentIntentId) return;

  // A failure or success that arrived out of order already settled this one.
  const [failed, recorded] = await Promise.all([
    prisma.invoiceEvent.findFirst({
      where: { invoiceId, type: "PAYMENT_FAILED", detail: paymentIntentId },
    }),
    prisma.payment.findUnique({ where: { externalId: externalIdFor(paymentIntentId) } }),
  ]);
  if (failed || recorded) return;

  const { count } = await prisma.invoice.updateMany({
    where: { id: invoiceId, status: "SENT", stripePaymentIntentId: null },
    data: { stripeCheckoutSessionId: session.id, stripePaymentIntentId: paymentIntentId },
  });
  if (!count) return;
  await prisma.invoiceEvent.create({
    data: { invoiceId, type: "PAYMENT_PROCESSING", detail: paymentIntentId },
  });
}

/** A bank payment bounced: forget it so the client can pay again, take back
 * the payment if one had been recorded for it (reopening the invoice), and
 * tell the org. */
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
      data: { stripePaymentIntentId: null, stripeCheckoutSessionId: null },
    });
  }
  let reopened = false;
  const recorded = await prisma.payment.findUnique({ where: { externalId: externalIdFor(paymentIntentId) } });
  if (recorded) {
    try {
      const result = await deletePayment({ orgId: invoice.orgId, actorId: null }, recorded.id);
      reopened = result.reopened;
    } catch (err) {
      // E.g. a deposit's credit was already spent: leave the payment for a
      // person to sort out; the alert below says it failed.
      if (!(err instanceof PaymentError)) throw err;
      console.error(`[stripe webhook] Couldn't remove failed payment ${recorded.id}: ${err.message}`);
    }
  }
  await prisma.invoiceEvent.create({
    data: { invoiceId, type: "PAYMENT_FAILED", detail: paymentIntentId },
  });

  const amount = session.amount_total != null ? session.amount_total / 100 : Number(invoice.total);
  await sendAlert({
    orgId: invoice.orgId,
    event: "PAYMENT_FAILED",
    message: `The bank payment for invoice ${invoice.number} from ${invoice.client.name} failed (${formatCurrency(amount, invoice.currency)})${reopened ? " — it's marked unpaid again" : ""}.`,
    link: `/invoices/${invoice.id}`,
  });
}
