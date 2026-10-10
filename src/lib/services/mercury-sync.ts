import "server-only";
import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/crypto";
import { getInvoice } from "@/lib/integrations/mercury";
import { notifyInvoiceStatusChange } from "@/lib/services/invoices";

// Mercury has no webhook for invoice payment status (only
// transaction.created/updated on the org's own accounts), so this polls
// every SENT invoice with a Mercury invoice attached, across every org with
// a Mercury connection, and marks ours PAID when Mercury agrees.
export async function syncMercuryInvoiceStatuses() {
  const invoices = await prisma.invoice.findMany({
    where: { status: "SENT", mercuryInvoiceId: { not: null } },
    include: { client: true, org: { include: { mercuryConnection: true } } },
  });

  let paidCount = 0;
  for (const invoice of invoices) {
    const connection = invoice.org.mercuryConnection;
    if (!connection || !invoice.mercuryInvoiceId) continue;

    try {
      const mercuryInvoice = await getInvoice(decrypt(connection.apiToken), invoice.mercuryInvoiceId);
      if (mercuryInvoice.status !== "Paid") continue;

      // Idempotency: skip if a previous run (or a since-changed status) has
      // already moved this invoice off SENT.
      const current = await prisma.invoice.findUnique({ where: { id: invoice.id } });
      if (!current || current.status !== "SENT") continue;

      await prisma.invoice.update({ where: { id: invoice.id }, data: { status: "PAID", paidAt: new Date() } });
      await notifyInvoiceStatusChange(invoice.org, invoice, "PAID");
      paidCount++;
    } catch (err) {
      console.warn(`[mercury-sync] Failed to sync invoice ${invoice.id}`, err);
    }
  }

  return { checked: invoices.length, paidCount };
}
