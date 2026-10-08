import "server-only";
import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/crypto";
import { getStripe } from "@/lib/stripe";
import {
  findOrCreateCustomer as findOrCreateMercuryCustomer,
  createInvoice as createMercuryInvoiceRecord,
  payPageUrl as mercuryPayPageUrl,
} from "@/lib/integrations/mercury";
import type { Invoice, Organization, Client } from "@/generated/prisma/client";

export class InvoicePaymentError extends Error {}

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
    throw new InvoicePaymentError("This invoice isn't open for payment.");
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
  if (invoice.mercuryInvoiceSlug) {
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
    lineItems: [{ name: `Invoice ${invoice.number}`, unitPrice: Number(invoice.total), quantity: 1 }],
    invoiceDate: invoice.issueDate,
    dueDate: invoice.dueDate,
    invoiceNumber: invoice.number,
    currencyCode: invoice.currency,
  });

  await prisma.invoice.update({
    where: { id: invoice.id },
    data: { mercuryInvoiceId: created.id, mercuryInvoiceSlug: created.slug },
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
  const amountCents = Math.round(Number(invoice.total) * 100);

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: [
      {
        price_data: {
          currency: invoice.currency.toLowerCase(),
          unit_amount: amountCents,
          product_data: {
            name: `Invoice ${invoice.number}`,
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
    success_url: `${returnBaseUrl}?paid=success`,
    cancel_url: `${returnBaseUrl}?paid=cancelled`,
    metadata: { invoiceId: invoice.id },
  });

  if (!session.url) throw new InvoicePaymentError("Stripe did not return a checkout URL.");
  return session.url;
}
