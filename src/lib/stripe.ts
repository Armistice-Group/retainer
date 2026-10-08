import "server-only";
import Stripe from "stripe";
import { getConfig } from "@/lib/instance-config";

// Only used for Stripe Connect invoice payments — there's no subscription
// billing on a self-hosted instance. The key comes from .env or Settings →
// Payments (see lib/instance-config).
let client: { key: string; stripe: Stripe } | null = null;

export async function isStripeConfigured() {
  return !!(await getConfig("STRIPE_SECRET_KEY"));
}

export async function getStripe() {
  const key = await getConfig("STRIPE_SECRET_KEY");
  if (!key) throw new Error("Stripe isn't configured on this instance.");
  // Rebuild the client if the key was changed in settings.
  if (client?.key !== key) client = { key, stripe: new Stripe(key) };
  return client.stripe;
}
