import "server-only";
import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/crypto";
import { getInvoice } from "@/lib/integrations/mercury";
import { balanceCents, toCents } from "@/lib/invoice-balance";
import { recordPayment } from "@/lib/services/payments";

// Mercury has no webhook for invoice payment status (only
// transaction.created/updated on the org's own accounts), so this polls
// every SENT invoice with a Mercury invoice attached, across every org with
// a Mercury connection, and records a payment when Mercury says it's paid.
export async function syncMercuryInvoiceStatuses() {
  const invoices = await prisma.invoice.findMany({
    where: { status: "SENT", mercuryInvoiceId: { not: null } },
    include: { org: { include: { mercuryConnection: true } } },
  });

  let paidCount = 0;
  for (const invoice of invoices) {
    const connection = invoice.org.mercuryConnection;
    const mercuryInvoiceId = invoice.mercuryInvoiceId;
    if (!connection || !mercuryInvoiceId) continue;

    try {
      const mercuryInvoice = await getInvoice(decrypt(connection.apiToken), mercuryInvoiceId);
      if (mercuryInvoice.status !== "Paid") continue;

      // The Mercury invoice asked for the balance when it was made (or the
      // full total, for one made before amounts were tracked).
      const amountCents =
        invoice.mercuryInvoiceAmount != null
          ? toCents(invoice.mercuryInvoiceAmount)
          : Math.max(0, balanceCents(invoice));
      if (amountCents > 0) {
        // Keyed on the Mercury invoice, so a second run records nothing.
        const result = await recordPayment(
          { orgId: invoice.orgId, actorId: null },
          {
            invoiceId: invoice.id,
            amount: amountCents / 100,
            source: "MERCURY",
            method: "Paid online (Mercury)",
            reference: mercuryInvoiceId,
            externalId: `mercury:${mercuryInvoiceId}`,
            allowOverpayment: true,
          }
        );
        if (result.becamePaid) paidCount++;
      }
      // Settled: stop polling it, and let a later "Pay now" (if a balance is
      // ever left) make a fresh Mercury invoice.
      await prisma.invoice.updateMany({
        where: { id: invoice.id, mercuryInvoiceId },
        data: { mercuryInvoiceId: null, mercuryInvoiceSlug: null, mercuryInvoiceAmount: null },
      });
    } catch (err) {
      console.warn(`[mercury-sync] Failed to sync invoice ${invoice.id}`, err);
    }
  }

  return { checked: invoices.length, paidCount };
}
