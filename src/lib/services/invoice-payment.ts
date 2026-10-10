import "server-only";
import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/crypto";
import { getStripe } from "@/lib/stripe";
import {
  findOrCreateCustomer as findOrCreateMercuryCustomer,
  createInvoice as createMercuryInvoiceRecord,
  payPageUrl as mercuryPayPageUrl,
} from "@/lib/integrations/mercury";
import { balanceCents, toCents } from "@/lib/invoice-balance";
import type { Invoice, Organization, Client } from "@/generated/prisma/client";

/** `reason` is what the client-facing invoice page shows after a failed
 * "Pay now" (see /i/[token]/pay). */
export class InvoicePaymentError extends Error {
  constructor(
    message: string,
    readonly reason: "not_open" | "processing" | "unavailable" = "unavailable"
  ) {
    super(message);
  }
}

type PayableInvoice = Invoice & {
  client: Pick<Client, "id" | "name" | "email" | "mercuryCustomerId">;
  org: Organization;
};

// Two payment rails, same "Pay now" contract for the share-portal /pay
// routes: whichever the org has connected wins. Mercury is checked first
// since it's the more recently-added, explicitly-opted-into alternative —
// an org wouldn't have a destinationAccountId set unless they'd deliberately
// picked an account, whereas Stripe Connect can be mid-onboarding.
export async function createInvoicePaymentCheckoutUrl(
  invoice: PayableInvoice,
  returnBaseUrl: string
) {
  if (invoice.status !== "SENT") {
    throw new InvoicePaymentError("This invoice isn't open for payment.", "not_open");
  }
  // A bank (ACH) payment from an earlier checkout is still clearing.
  if (invoice.stripePaymentIntentId) {
    throw new InvoicePaymentError("A payment for this invoice is already processing.", "processing");
  }
  // Online payment is for what's still due, not the original total.
  if (balanceCents(invoice) <= 0) {
    throw new InvoicePaymentError("This invoice isn't open for payment.", "not_open");
  }

  const mercuryConnection = await prisma.mercuryConnection.findUnique({
    where: { orgId: invoice.orgId },
  });
  if (mercuryConnection?.destinationAccountId) {
    return createMercuryInvoicePaymentUrl(invoice, {
      apiToken: mercuryConnection.apiToken,
      destinationAccountId: mercuryConnection.destinationAccountId,
    });
  }

  return createStripeInvoicePaymentCheckoutUrl(invoice, returnBaseUrl);
}

async function createMercuryInvoicePaymentUrl(
  invoice: PayableInvoice,
  connection: { apiToken: string; destinationAccountId: string }
) {
  // Reuse the invoice we already created on a previous "Pay now" click
  // instead of creating a duplicate on Mercury's side every time the link
  // is clicked (Mercury has no concept of an abandonable checkout session
  // the way Stripe does — every create call makes a real, visible invoice).
  // Only while it still asks for the current balance, though: after a part
  // payment recorded here, a fresh one for the rest replaces it (the old one
  // should be cancelled in Mercury). One made before amounts were tracked
  // asked for the full total.
  const balance = balanceCents(invoice);
  const askedFor =
    invoice.mercuryInvoiceAmount != null ? toCents(invoice.mercuryInvoiceAmount) : toCents(invoice.total);
  if (invoice.mercuryInvoiceSlug && askedFor === balance) {
    return mercuryPayPageUrl(invoice.mercuryInvoiceSlug);
  }

  if (!invoice.client.email) {
    throw new InvoicePaymentError(
      "This client doesn't have an email on file, which Mercury requires to invoice them."
    );
  }

  const token = decrypt(connection.apiToken);

  const customerId = await findOrCreateMercuryCustomer(
    token,
    { name: invoice.client.name, email: invoice.client.email },
    invoice.client.mercuryCustomerId
  );
  if (customerId !== invoice.client.mercuryCustomerId) {
    await prisma.client.update({
      where: { id: invoice.client.id },
      data: { mercuryCustomerId: customerId },
    });
  }

  const created = await createMercuryInvoiceRecord(token, {
    customerId,
    destinationAccountId: connection.destinationAccountId,
    lineItems: [{ name: lineName(invoice), unitPrice: balance / 100, quantity: 1 }],
    invoiceDate: invoice.issueDate,
    dueDate: invoice.dueDate,
    // Mercury needs a fresh number for a replacement invoice.
    invoiceNumber: invoice.mercuryInvoiceId ? `${invoice.number}-${Date.now().toString(36)}` : invoice.number,
    currencyCode: invoice.currency,
  });

  await prisma.invoice.update({
    where: { id: invoice.id },
    data: { mercuryInvoiceId: created.id, mercuryInvoiceSlug: created.slug, mercuryInvoiceAmount: balance / 100 },
  });

  return mercuryPayPageUrl(created.slug);
}

// Destination charge on the platform's own Stripe account, not a Checkout
// Session created directly on the connected account — this way the payment
// webhook arrives on the app's existing endpoint with no separate Connect
// webhook endpoint/secret needed. Money is swept to the connected account via
// transfer_data.destination.
async function createStripeInvoicePaymentCheckoutUrl(
  invoice: PayableInvoice,
  returnBaseUrl: string
) {
  if (!invoice.org.stripeConnectAccountId) {
    throw new InvoicePaymentError("Online payment isn't set up for this invoice yet.");
  }
  if (!invoice.org.stripeConnectChargesEnabled) {
    throw new InvoicePaymentError("Payment setup isn't finished on the recipient's side yet.");
  }

  const stripe = await getStripe();
  const amountCents = balanceCents(invoice);

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: [
      {
        price_data: {
          currency: invoice.currency.toLowerCase(),
          unit_amount: amountCents,
          product_data: {
            name: lineName(invoice),
            description: `${invoice.client.name} — ${invoice.org.name}`,
          },
        },
        quantity: 1,
      },
    ],
    payment_intent_data: {
      transfer_data: { destination: invoice.org.stripeConnectAccountId },
      description: `Invoice ${invoice.number} for ${invoice.client.name}`,
    },
    success_url: withParam(returnBaseUrl, "paid", "success"),
    cancel_url: withParam(returnBaseUrl, "paid", "cancelled"),
    metadata: { invoiceId: invoice.id },
  });

  if (!session.url) throw new InvoicePaymentError("Stripe did not return a checkout URL.");
  return session.url;
}

/** "Invoice INV-0042", or "… (balance due)" once part of it is paid. */
function lineName(invoice: Invoice) {
  const settled = toCents(invoice.amountPaid) + toCents(invoice.creditApplied);
  const kind = invoice.kind === "DEPOSIT" ? "Deposit invoice" : "Invoice";
  return `${kind} ${invoice.number}${settled > 0 ? " (balance due)" : ""}`;
}

function withParam(url: string, key: string, value: string) {
  const u = new URL(url);
  u.searchParams.set(key, value);
  return u.toString();
}
