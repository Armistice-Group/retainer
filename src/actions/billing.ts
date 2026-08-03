"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireOrgContext, requireRole } from "@/lib/org-context";
import { getStripe, stripePriceId, isStripeConfigured, type BillingInterval } from "@/lib/stripe";
import { getOrigin } from "@/lib/url";

export async function startCheckoutAction(interval: BillingInterval) {
  const { org, role, user } = await requireOrgContext();
  requireRole(role, ["OWNER", "ADMIN"]);

  if (!isStripeConfigured()) {
    throw new Error("Billing isn't configured yet. Contact support.");
  }

  const stripe = getStripe();
  const origin = await getOrigin();

  let customerId = org.stripeCustomerId;
  if (!customerId) {
    const customer = await stripe.customers.create({
      name: org.name,
      email: user.email ?? undefined,
      metadata: { orgId: org.id },
    });
    customerId = customer.id;
    await prisma.organization.update({
      where: { id: org.id },
      data: { stripeCustomerId: customerId },
    });
  }

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    client_reference_id: org.id,
    line_items: [{ price: stripePriceId(interval), quantity: 1 }],
    success_url: `${origin}/settings/billing?checkout=success`,
    cancel_url: `${origin}/settings/billing?checkout=cancelled`,
    metadata: { orgId: org.id, interval },
    subscription_data: { metadata: { orgId: org.id, interval } },
  });

  if (!session.url) throw new Error("Stripe did not return a checkout URL.");
  redirect(session.url);
}

export async function openBillingPortalAction() {
  const { org, role } = await requireOrgContext();
  requireRole(role, ["OWNER", "ADMIN"]);

  if (!org.stripeCustomerId) {
    throw new Error("No billing account yet — start a subscription first.");
  }

  const stripe = getStripe();
  const origin = await getOrigin();

  const session = await stripe.billingPortal.sessions.create({
    customer: org.stripeCustomerId,
    return_url: `${origin}/settings/billing`,
  });

  redirect(session.url);
}
