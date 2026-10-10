import "server-only";
import { prisma } from "@/lib/prisma";
import {
  findOrCreateCustomer,
  findOrCreateDefaultItem,
  createInvoice,
  updateInvoice,
  fetchInvoiceStatus,
  QuickBooksError,
} from "@/lib/integrations/quickbooks";

export { QuickBooksError };

export async function pushInvoiceToQuickBooks(orgId: string, invoiceId: string) {
  const connection = await prisma.quickBooksConnection.findUnique({ where: { orgId } });
  if (!connection) {
    throw new QuickBooksError("This organization isn't connected to QuickBooks yet.");
  }

  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: { client: true, lineItems: { orderBy: { sortOrder: "asc" } } },
  });
  if (!invoice || invoice.orgId !== orgId) {
    throw new QuickBooksError("Invoice not found.");
  }
  if (invoice.lineItems.length === 0) {
    throw new QuickBooksError("This invoice has no line items to push.");
  }
  // Lines go over without tax, so QuickBooks would show a smaller total than
  // the client was billed. Sales tax setup differs by company and region in
  // QuickBooks, so rather than guess at it, don't push a wrong invoice.
  if (Number(invoice.taxAmount) > 0) {
    throw new QuickBooksError(
      "This invoice includes tax, which can't be pushed to QuickBooks yet — it would arrive without the tax and show a smaller total. Enter it in QuickBooks directly instead."
    );
  }

  const customerId = await findOrCreateCustomer(
    connection,
    { name: invoice.client.name, email: invoice.client.email },
    invoice.client.quickbooksCustomerId
  );
  if (customerId !== invoice.client.quickbooksCustomerId) {
    await prisma.client.update({
      where: { id: invoice.client.id },
      data: { quickbooksCustomerId: customerId },
    });
  }

  const itemId = await findOrCreateDefaultItem(connection);

  const params = {
    customerId,
    itemId,
    dueDate: invoice.dueDate,
    docNumber: invoice.number,
    lineItems: invoice.lineItems.map((li) => ({
      description: li.description,
      quantity: Number(li.quantity),
      rate: Number(li.rate),
    })),
  };
  // Re-pushing updates the invoice already in QuickBooks instead of creating
  // a duplicate (unless it was deleted there).
  const quickbooksInvoiceId =
    (invoice.quickbooksInvoiceId &&
      (await updateInvoice(connection, invoice.quickbooksInvoiceId, params))) ||
    (await createInvoice(connection, params));

  await prisma.invoice.update({
    where: { id: invoice.id },
    data: { quickbooksInvoiceId, quickbooksSyncedAt: new Date() },
  });

  return quickbooksInvoiceId;
}

/**
 * Pulls the invoice's current status back from QuickBooks. Only ever moves
 * status forward (SENT → PAID), never backward — QuickBooks briefly showing
 * an unsent email status, for instance, shouldn't downgrade an invoice we
 * already know was sent.
 */
export async function syncInvoiceStatusFromQuickBooks(orgId: string, invoiceId: string) {
  const connection = await prisma.quickBooksConnection.findUnique({ where: { orgId } });
  if (!connection) {
    throw new QuickBooksError("This organization isn't connected to QuickBooks yet.");
  }

  const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId } });
  if (!invoice || invoice.orgId !== orgId) {
    throw new QuickBooksError("Invoice not found.");
  }
  if (!invoice.quickbooksInvoiceId) {
    throw new QuickBooksError("This invoice hasn't been pushed to QuickBooks yet.");
  }

  const remote = await fetchInvoiceStatus(connection, invoice.quickbooksInvoiceId);

  let nextStatus: "SENT" | "PAID" | null = null;
  if (remote.totalAmt > 0 && remote.balance <= 0) {
    nextStatus = "PAID";
  } else if (remote.emailStatus === "EmailSent" && invoice.status === "DRAFT") {
    nextStatus = "SENT";
  }

  const rank = { DRAFT: 0, SENT: 1, PAID: 2, VOID: 3 };
  if (nextStatus && rank[nextStatus] > rank[invoice.status]) {
    await prisma.invoice.update({
      where: { id: invoice.id },
      data: {
        status: nextStatus,
        ...(nextStatus === "PAID" ? { paidAt: new Date() } : {}),
        quickbooksSyncedAt: new Date(),
      },
    });
    return nextStatus;
  }

  await prisma.invoice.update({
    where: { id: invoice.id },
    data: { quickbooksSyncedAt: new Date() },
  });
  return invoice.status;
}
