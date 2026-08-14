import "server-only";

export class MercuryError extends Error {}

const API_BASE = "https://api.mercury.com/api/v1";

async function mercuryFetch(token: string, path: string, init?: RequestInit) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...init?.headers,
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new MercuryError(`Mercury API request to ${path} failed (${res.status}): ${text}`);
  }

  return res.json();
}

export type MercuryAccount = {
  id: string;
  name: string;
};

// Only the org's own Mercury checking/savings accounts (type "mercury") can
// receive AR invoice payments — external/linked accounts and payment
// recipients show up in the same list but aren't valid deposit destinations.
// Doubles as a cheap way to validate a pasted token before saving it: a bad
// or insufficiently-scoped token fails here with a 401/403 instead of only
// surfacing on the first real invoice.
export async function listEligibleAccounts(token: string): Promise<MercuryAccount[]> {
  const data = await mercuryFetch(token, "/accounts");
  const accounts = (data?.accounts ?? []) as Array<{
    id: string;
    name: string;
    nickname: string | null;
    type: string;
    status: string;
  }>;
  return accounts
    .filter((a) => a.type === "mercury" && a.status === "active")
    .map((a) => ({ id: a.id, name: a.nickname || a.name }));
}

export async function findOrCreateCustomer(
  token: string,
  customer: { name: string; email: string },
  existingCustomerId: string | null
) {
  if (existingCustomerId) return existingCustomerId;

  const created = await mercuryFetch(token, "/ar/customers", {
    method: "POST",
    body: JSON.stringify({ name: customer.name, email: customer.email }),
  });
  return created.id as string;
}

export type MercuryInvoiceLineItem = {
  name: string;
  unitPrice: number;
  quantity: number;
};

export type MercuryInvoiceStatus = "Unpaid" | "Paid" | "Cancelled" | "Processing";

export type MercuryInvoice = {
  id: string;
  slug: string;
  status: MercuryInvoiceStatus;
};

export async function createInvoice(
  token: string,
  params: {
    customerId: string;
    destinationAccountId: string;
    lineItems: MercuryInvoiceLineItem[];
    invoiceDate: Date;
    dueDate: Date;
    invoiceNumber: string;
    currencyCode: string;
  }
): Promise<MercuryInvoice> {
  const created = await mercuryFetch(token, "/ar/invoices", {
    method: "POST",
    body: JSON.stringify({
      customerId: params.customerId,
      destinationAccountId: params.destinationAccountId,
      lineItems: params.lineItems,
      invoiceDate: params.invoiceDate.toISOString().slice(0, 10),
      dueDate: params.dueDate.toISOString().slice(0, 10),
      invoiceNumber: params.invoiceNumber,
      currencyCode: params.currencyCode,
      // We send the client to the hosted pay page ourselves from our own
      // share portal — letting Mercury also email them directly would be a
      // confusing duplicate of the notification we already send.
      sendEmailOption: "DontSend",
      creditCardEnabled: true,
      achDebitEnabled: true,
      useRealAccountNumber: true,
      ccEmails: [],
    }),
  });
  return { id: created.id, slug: created.slug, status: created.status };
}

// No webhook exists for invoice payment status (Mercury only pushes
// transaction.created/updated for the org's own accounts) — status has to be
// polled, see src/lib/services/mercury-sync.ts.
export async function getInvoice(token: string, mercuryInvoiceId: string): Promise<MercuryInvoice> {
  const data = await mercuryFetch(token, `/ar/invoices/${mercuryInvoiceId}`);
  return { id: data.id, slug: data.slug, status: data.status };
}

export function payPageUrl(slug: string) {
  return `https://app.mercury.com/pay/${slug}`;
}
