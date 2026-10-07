import "server-only";
import Stripe from "stripe";

let client: Stripe | null = null;

// Only used for Stripe Connect invoice payments — there's no subscription
// billing on a self-hosted instance, so a secret key is all that's needed.
export function isStripeConfigured() {
  return !!process.env.STRIPE_SECRET_KEY;
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
