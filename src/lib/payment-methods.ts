// Payment method types and their fields — plain module (no server imports),
// shared by the settings forms, the share page, and the invoice PDF.

export type PaymentMethodType =
  | "ACH"
  | "WIRE"
  | "CHECK"
  | "STRIPE_LINK"
  | "PADDLE"
  | "PAYPAL"
  | "VENMO"
  | "ZELLE"
  | "CRYPTO"
  | "OTHER";

export type PaymentField = {
  key: string;
  label: string;
  required?: boolean;
  placeholder?: string;
  multiline?: boolean;
  url?: boolean;
  options?: string[];
};

export type PaymentTypeDef = {
  type: PaymentMethodType;
  name: string;
  /** Bank details default to the share page only — a PDF gets forwarded. */
  showOnPdfByDefault: boolean;
  fields: PaymentField[];
};

export const PAYMENT_TYPES: PaymentTypeDef[] = [
  {
    type: "ACH",
    name: "ACH bank transfer",
    showOnPdfByDefault: false,
    fields: [
      { key: "bankName", label: "Bank", placeholder: "Chase" },
      { key: "accountName", label: "Account name", placeholder: "Acme Consulting LLC" },
      { key: "routingNumber", label: "Routing number", required: true },
      { key: "accountNumber", label: "Account number", required: true },
      { key: "accountType", label: "Account type", options: ["Checking", "Savings"] },
    ],
  },
  {
    type: "WIRE",
    name: "Wire transfer",
    showOnPdfByDefault: false,
    fields: [
      { key: "bankName", label: "Bank", required: true },
      { key: "accountName", label: "Beneficiary name", required: true },
      { key: "accountNumber", label: "Account number", required: true },
      { key: "routingNumber", label: "ABA routing number" },
      { key: "swift", label: "SWIFT / BIC" },
      { key: "iban", label: "IBAN" },
      { key: "bankAddress", label: "Bank address", multiline: true },
      { key: "reference", label: "Reference to include", placeholder: "Invoice number" },
    ],
  },
  {
    type: "CHECK",
    name: "Check",
    showOnPdfByDefault: true,
    fields: [
      { key: "payableTo", label: "Payable to", required: true },
      { key: "mailingAddress", label: "Mail to", required: true, multiline: true },
    ],
  },
  {
    type: "STRIPE_LINK",
    name: "Stripe payment link",
    showOnPdfByDefault: true,
    fields: [
      { key: "url", label: "Payment link", required: true, url: true, placeholder: "https://buy.stripe.com/..." },
    ],
  },
  {
    type: "PADDLE",
    name: "Paddle checkout",
    showOnPdfByDefault: true,
    fields: [{ key: "url", label: "Checkout link", required: true, url: true }],
  },
  {
    type: "PAYPAL",
    name: "PayPal",
    showOnPdfByDefault: true,
    fields: [
      { key: "account", label: "PayPal email or PayPal.Me link", required: true, placeholder: "paypal.me/acme" },
    ],
  },
  {
    type: "VENMO",
    name: "Venmo",
    showOnPdfByDefault: true,
    fields: [{ key: "handle", label: "Venmo handle", required: true, placeholder: "@acme-consulting" }],
  },
  {
    type: "ZELLE",
    name: "Zelle",
    showOnPdfByDefault: true,
    fields: [
      { key: "account", label: "Email or phone", required: true },
      { key: "name", label: "Name on account" },
    ],
  },
  {
    type: "CRYPTO",
    name: "Crypto",
    showOnPdfByDefault: false,
    fields: [
      { key: "currency", label: "Currency", required: true, placeholder: "USDC" },
      { key: "network", label: "Network", placeholder: "Ethereum, Solana, Base..." },
      { key: "address", label: "Wallet address", required: true },
    ],
  },
  {
    type: "OTHER",
    name: "Other",
    showOnPdfByDefault: true,
    fields: [{ key: "text", label: "Instructions", required: true, multiline: true }],
  },
];

export const PAYMENT_TYPE_VALUES = PAYMENT_TYPES.map((t) => t.type) as [
  PaymentMethodType,
  ...PaymentMethodType[],
];

export function paymentTypeDef(type: PaymentMethodType) {
  return PAYMENT_TYPES.find((t) => t.type === type) ?? PAYMENT_TYPES[PAYMENT_TYPES.length - 1];
}

export type PaymentDetails = Record<string, string>;

/** Validates and trims a method's fields; returns per-field errors. */
export function validatePaymentDetails(type: PaymentMethodType, raw: Record<string, unknown>) {
  const def = paymentTypeDef(type);
  const details: PaymentDetails = {};
  const errors: Record<string, string[]> = {};
  for (const field of def.fields) {
    const value = String(raw[field.key] ?? "").trim().slice(0, 2000);
    if (!value) {
      if (field.required) errors[field.key] = [`${field.label} is required.`];
      continue;
    }
    if (field.url && !/^https:\/\//i.test(value)) {
      errors[field.key] = ["Enter a full https:// link."];
      continue;
    }
    if (field.options && !field.options.includes(value)) {
      errors[field.key] = ["Pick one of the options."];
      continue;
    }
    details[field.key] = value;
  }
  return { details, errors };
}

export type DisplayMethod = {
  id: string;
  title: string;
  lines: { label: string; value: string; url?: boolean }[];
  showOnPdf: boolean;
};

/** Heading + labelled lines for rendering a method anywhere. */
export function displayPaymentMethod(method: {
  id: string;
  type: PaymentMethodType;
  label: string | null;
  details: unknown;
  showOnPdf: boolean;
}): DisplayMethod {
  const def = paymentTypeDef(method.type);
  const details = (method.details ?? {}) as PaymentDetails;
  const lines = def.fields
    .filter((f) => details[f.key])
    .map((f) => ({
      // Free text speaks for itself; no "Instructions:" prefix.
      label: method.type === "OTHER" ? "" : f.label,
      value: details[f.key],
      url: f.url,
    }));
  return {
    id: method.id,
    title: method.label
      ? `${def.name} — ${method.label}`
      : method.type === "OTHER"
        ? "Payment instructions"
        : def.name,
    lines,
    showOnPdf: method.showOnPdf,
  };
}
