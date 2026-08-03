// Plain pricing constants — no server-only imports, safe to use from the
// marketing page as well as server-side billing code. Keep in sync with the
// actual Stripe Price objects (STRIPE_PRICE_ID_MONTHLY / _YEARLY).
export const MONTHLY_PRICE_USD = 14.99;
export const YEARLY_PRICE_USD = 149.99;
// Computed from the two prices above rather than hardcoded, so copy stays
// accurate if either price changes.
export const YEARLY_DISCOUNT_PERCENT = Math.round(
  (1 - YEARLY_PRICE_USD / (MONTHLY_PRICE_USD * 12)) * 100
);
