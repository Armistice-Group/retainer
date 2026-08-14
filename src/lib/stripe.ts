import "server-only";
import Stripe from "stripe";
import type { Plan } from "@/generated/prisma/client";

let client: Stripe | null = null;

export type BillingInterval = "monthly" | "yearly";
export type BillingTier = "paid" | "growth";

export {
  MONTHLY_PRICE_USD,
  YEARLY_PRICE_USD,
  YEARLY_DISCOUNT_PERCENT,
  GROWTH_MONTHLY_PRICE_USD,
  GROWTH_YEARLY_PRICE_USD,
  GROWTH_YEARLY_DISCOUNT_PERCENT,
} from "@/lib/pricing";

export function isStripeConfigured() {
  return (
    !!process.env.STRIPE_SECRET_KEY &&
    !!process.env.STRIPE_PRICE_ID_MONTHLY &&
    !!process.env.STRIPE_PRICE_ID_YEARLY
  );
}

export function isGrowthTierConfigured() {
  return (
    isStripeConfigured() &&
    !!process.env.STRIPE_PRICE_ID_GROWTH_MONTHLY &&
    !!process.env.STRIPE_PRICE_ID_GROWTH_YEARLY
  );
}

export function getStripe() {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error("STRIPE_SECRET_KEY is not configured.");
  }
  if (!client) {
    client = new Stripe(process.env.STRIPE_SECRET_KEY);
  }
  return client;
}

const PRICE_ENV_VAR: Record<BillingTier, Record<BillingInterval, string>> = {
  paid: { monthly: "STRIPE_PRICE_ID_MONTHLY", yearly: "STRIPE_PRICE_ID_YEARLY" },
  growth: { monthly: "STRIPE_PRICE_ID_GROWTH_MONTHLY", yearly: "STRIPE_PRICE_ID_GROWTH_YEARLY" },
};

export function stripePriceId(tier: BillingTier, interval: BillingInterval) {
  const envVar = PRICE_ENV_VAR[tier][interval];
  const priceId = process.env[envVar];
  if (!priceId) throw new Error(`${envVar} is not configured.`);
  return priceId;
}

// Reverse lookup for webhooks — Stripe subscription events carry a price ID,
// not our own "tier" label, so this is how we map back to a Plan.
export function planForPriceId(priceId: string): Plan | null {
  if (
    priceId === process.env.STRIPE_PRICE_ID_GROWTH_MONTHLY ||
    priceId === process.env.STRIPE_PRICE_ID_GROWTH_YEARLY
  ) {
    return "GROWTH";
  }
  if (
    priceId === process.env.STRIPE_PRICE_ID_MONTHLY ||
    priceId === process.env.STRIPE_PRICE_ID_YEARLY
  ) {
    return "PAID";
  }
  return null;
}
