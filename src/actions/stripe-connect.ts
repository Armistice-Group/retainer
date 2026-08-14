"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireOrgContext, requireRole } from "@/lib/org-context";
import { getStripe, isStripeConfigured } from "@/lib/stripe";
import { getOrigin } from "@/lib/url";

// Express account creation + an Account Link is the standard Stripe Connect
// onboarding flow — Stripe hosts the actual form (business details, bank
// account) and redirects back to return_url when done. Re-running this for
// an org that already has an account just issues a fresh Account Link
// (useful if the first one expired or onboarding was abandoned partway).
export async function startStripeConnectOnboardingAction() {
  const { org, role, user } = await requireOrgContext();
  requireRole(role, ["OWNER", "ADMIN"]);

  if (org.plan !== "GROWTH") {
    throw new Error("Stripe Connect requires the Growth plan.");
  }
  if (!isStripeConfigured()) {
    throw new Error("Billing isn't configured yet. Contact support.");
  }

  const stripe = getStripe();
  const origin = await getOrigin();

  let accountId = org.stripeConnectAccountId;
  if (!accountId) {
    const account = await stripe.accounts.create({
      type: "express",
      email: user.email ?? undefined,
      business_type: "company",
      company: { name: org.name },
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
        us_bank_account_ach_payments: { requested: true },
      },
      metadata: { orgId: org.id },
    });
    accountId = account.id;
    await prisma.organization.update({
      where: { id: org.id },
      data: { stripeConnectAccountId: accountId },
    });
  }

  const accountLink = await stripe.accountLinks.create({
    account: accountId,
    refresh_url: `${origin}/settings/billing?connect=refresh`,
    return_url: `${origin}/settings/billing?connect=return`,
    type: "account_onboarding",
  });

  redirect(accountLink.url);
}

// Express accounts don't have a normal password login — this issues a
// single-use link into the Stripe-hosted Express dashboard for that
// connected account (payouts, tax forms, bank details).
export async function openStripeConnectDashboardAction() {
  const { org, role } = await requireOrgContext();
  requireRole(role, ["OWNER", "ADMIN"]);

  if (!org.stripeConnectAccountId) {
    throw new Error("Connect Stripe first.");
  }

  const stripe = getStripe();
  const loginLink = await stripe.accounts.createLoginLink(org.stripeConnectAccountId);
  redirect(loginLink.url);
}
