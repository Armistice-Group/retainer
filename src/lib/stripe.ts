import "server-only";
import Stripe from "stripe";

let client: Stripe | null = null;

export type BillingInterval = "monthly" | "yearly";

export { MONTHLY_PRICE_USD, YEARLY_PRICE_USD, YEARLY_DISCOUNT_PERCENT } from "@/lib/pricing";

export function isStripeConfigured() {
  return (
    !!process.env.STRIPE_SECRET_KEY &&
    !!process.env.STRIPE_PRICE_ID_MONTHLY &&
    !!process.env.STRIPE_PRICE_ID_YEARLY
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

export function stripePriceId(interval: BillingInterval) {
  const envVar = interval === "monthly" ? "STRIPE_PRICE_ID_MONTHLY" : "STRIPE_PRICE_ID_YEARLY";
  const priceId = process.env[envVar];
  if (!priceId) throw new Error(`${envVar} is not configured.`);
  return priceId;
}
