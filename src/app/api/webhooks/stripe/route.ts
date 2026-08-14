import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { getStripe, planForPriceId } from "@/lib/stripe";
import { notifyInvoiceStatusChange } from "@/lib/services/invoices";

// Stripe is the only source of truth for whether an org is actually paying —
// this webhook is what flips Organization.plan, never anything client-driven.
// Must read the raw body (not req.json()) for signature verification to work.
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

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;

      // Invoice "Pay now" checkout (Stripe Connect, destination charge on the
      // platform account) — distinct from a subscription checkout below.
      if (session.mode === "payment" && session.metadata?.invoiceId) {
        await handleInvoicePaymentCompleted(session);
        break;
      }

      const orgId = session.client_reference_id ?? session.metadata?.orgId;
      const customerId =
        typeof session.customer === "string" ? session.customer : session.customer?.id;
      const subscriptionId =
        typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
      const tier = session.metadata?.tier === "growth" ? "GROWTH" : "PAID";

      if (orgId && customerId) {
        await prisma.organization.update({
          where: { id: orgId },
          data: {
            plan: tier,
            stripeCustomerId: customerId,
            stripeSubscriptionId: subscriptionId ?? null,
            stripeSubscriptionStatus: "active",
          },
        });
      }
      break;
    }

    case "customer.subscription.updated":
    case "customer.subscription.created": {
      const subscription = event.data.object as Stripe.Subscription;
      const org = await prisma.organization.findUnique({
        where: { stripeCustomerId: subscription.customer as string },
      });
      if (org) {
        const active = subscription.status === "active" || subscription.status === "trialing";
        const priceId = subscription.items.data[0]?.price.id;
        const tier = priceId ? planForPriceId(priceId) : null;
        await prisma.organization.update({
          where: { id: org.id },
          data: {
            plan: active ? (tier ?? "PAID") : "FREE",
            stripeSubscriptionId: subscription.id,
            stripeSubscriptionStatus: subscription.status,
          },
        });
      }
      break;
    }

    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      const org = await prisma.organization.findUnique({
        where: { stripeCustomerId: subscription.customer as string },
      });
      if (org) {
        await prisma.organization.update({
          where: { id: org.id },
          data: {
            plan: "FREE",
            stripeSubscriptionId: null,
            stripeSubscriptionStatus: "canceled",
            // Stripe Connect is a Growth-plan perk — losing the subscription
            // shouldn't leave a dangling "charges enabled" flag that lets
            // invoices keep showing a Pay Now button nobody's paying for.
            stripeConnectChargesEnabled: false,
          },
        });
      }
      break;
    }

    default:
      break;
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
