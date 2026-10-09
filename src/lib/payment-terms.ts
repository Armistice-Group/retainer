import { addDays, toISODate } from "@/lib/date";

export type PaymentTermsValue =
  | "DUE_ON_RECEIPT"
  | "NET15"
  | "NET30"
  | "NET45"
  | "NET60"
  | "NET90"
  | "CUSTOM";

/** Every option an invoice can carry. CUSTOM means "pick the due date by
 * hand", so it can't be a client or project default. */
export const PAYMENT_TERMS_OPTIONS = [
  { value: "DUE_ON_RECEIPT", label: "Due on receipt", days: 0 },
  { value: "NET15", label: "Net 15", days: 15 },
  { value: "NET30", label: "Net 30", days: 30 },
  { value: "NET45", label: "Net 45", days: 45 },
  { value: "NET60", label: "Net 60", days: 60 },
  { value: "NET90", label: "Net 90", days: 90 },
  { value: "CUSTOM", label: "Custom", days: null },
] as const satisfies readonly { value: PaymentTermsValue; label: string; days: number | null }[];

export const DEFAULT_TERMS_OPTIONS = PAYMENT_TERMS_OPTIONS.filter((o) => o.value !== "CUSTOM");
export type DefaultPaymentTerms = Exclude<PaymentTermsValue, "CUSTOM">;
export const DEFAULT_TERMS_VALUES = DEFAULT_TERMS_OPTIONS.map((o) => o.value) as [
  DefaultPaymentTerms,
  ...DefaultPaymentTerms[],
];

export function paymentTermsLabel(terms: string) {
  return PAYMENT_TERMS_OPTIONS.find((o) => o.value === terms)?.label ?? terms;
}

export function paymentTermsDays(terms: string) {
  return PAYMENT_TERMS_OPTIONS.find((o) => o.value === terms)?.days ?? null;
}

/** Most specific wins: project, then client, then the org default. */
export function resolvePaymentTerms(levels: {
  project?: DefaultPaymentTerms | null;
  client?: DefaultPaymentTerms | null;
  org: DefaultPaymentTerms;
}): DefaultPaymentTerms {
  return levels.project ?? levels.client ?? levels.org;
}

/** yyyy-mm-dd due date for an issue date (yyyy-mm-dd) under these terms. */
export function dueDateFor(issueDate: string, terms: string) {
  const days = paymentTermsDays(terms);
  if (days === null || !issueDate) return null;
  return toISODate(addDays(new Date(`${issueDate}T00:00:00`), days));
}
