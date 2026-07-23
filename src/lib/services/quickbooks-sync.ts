import "server-only";
import { prisma } from "@/lib/prisma";
import {
  findOrCreateCustomer,
  findOrCreateDefaultItem,
  createInvoice,
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

  const quickbooksInvoiceId = await createInvoice(connection, {
    customerId,
    itemId,
    dueDate: invoice.dueDate,
    docNumber: invoice.number,
    lineItems: invoice.lineItems.map((li) => ({
      description: li.description,
      quantity: Number(li.quantity),
      rate: Number(li.rate),
    })),
  });

  await prisma.invoice.update({
    where: { id: invoice.id },
    data: { quickbooksInvoiceId, quickbooksSyncedAt: new Date() },
  });

  return quickbooksInvoiceId;
}
