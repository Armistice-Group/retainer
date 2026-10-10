import "server-only";
import { prisma } from "@/lib/prisma";

// Confidential projects are excluded from the client-wide rollup by
// default — "confidential" controls need-to-know visibility internally,
// and bundling one into a broadly-shareable link isn't something we
// should opt an org into silently. A confidential project still gets its
// own per-project share link (project-share.ts) if the org wants to send
// it deliberately.
export async function getClientByShareToken(token: string) {
  const client = await prisma.client.findUnique({
    where: { shareToken: token },
    include: {
      org: { include: { mercuryConnection: { select: { destinationAccountId: true } } } },
      projects: {
        where: { confidential: false },
        orderBy: { createdAt: "desc" },
      },
    },
  });
  if (!client) return null;

  const projectIds = client.projects.map((p) => p.id);
  if (projectIds.length === 0) {
    return { client, projects: [], loggedHours: 0, totalBilled: 0, totalPaid: 0, invoices: [] };
  }

  const [loggedAgg, billedAgg, paidAgg, invoices] = await Promise.all([
    prisma.timeEntry.aggregate({
      where: { projectId: { in: projectIds } },
      _sum: { hours: true },
    }),
    prisma.invoiceLineItem.aggregate({
      where: { projectId: { in: projectIds }, invoice: { status: { in: ["SENT", "PAID"] } } },
      _sum: { amount: true },
    }),
    prisma.invoiceLineItem.aggregate({
      where: { projectId: { in: projectIds }, invoice: { status: "PAID" } },
      _sum: { amount: true },
    }),
    prisma.invoice.findMany({
      where: {
        clientId: client.id,
        status: { in: ["SENT", "PAID"] },
        lineItems: { some: { projectId: { in: projectIds } } },
        // Exclude invoices that also touch a confidential project entirely
        // (not just their PDF) — otherwise the invoice's total, which would
        // include the confidential portion, still surfaces in the list.
        NOT: { lineItems: { some: { project: { confidential: true } } } },
      },
      select: {
        id: true,
        number: true,
        status: true,
        issueDate: true,
        dueDate: true,
        total: true,
        currency: true,
        stripePaymentIntentId: true,
      },
      orderBy: { issueDate: "desc" },
    }),
  ]);

  return {
    client,
    projects: client.projects,
    loggedHours: Number(loggedAgg._sum.hours ?? 0),
    totalBilled: Number(billedAgg._sum.amount ?? 0),
    totalPaid: Number(paidAgg._sum.amount ?? 0),
    invoices,
  };
}

export async function getClientShareTokenInvoiceIfAuthorized(token: string, invoiceId: string) {
  const client = await prisma.client.findUnique({
    where: { shareToken: token },
    include: { projects: { where: { confidential: false }, select: { id: true } } },
  });
  if (!client) return null;

  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: {
      client: true,
      org: true,
      lineItems: {
        orderBy: { sortOrder: "asc" },
        include: { timeEntries: { select: { id: true } } },
      },
    },
  });
  if (!invoice || invoice.clientId !== client.id) return null;
  if (invoice.status !== "SENT" && invoice.status !== "PAID") return null;

  // Every project-linked line item must be on a non-confidential project of
  // this client's — not just one of them — so an invoice that mixes a
  // confidential and a non-confidential project can't leak the confidential
  // one's line items just because the invoice also touches an authorized
  // project. Line items with no projectId (a flat manual charge) don't carry
  // project confidentiality, so they don't block authorization.
  const nonConfidentialProjectIds = new Set(client.projects.map((p) => p.id));
  const hasUnauthorizedLineItem = invoice.lineItems.some(
    (li) => li.projectId != null && !nonConfidentialProjectIds.has(li.projectId)
  );
  const hasAnyAuthorizedLineItem = invoice.lineItems.some(
    (li) => li.projectId != null && nonConfidentialProjectIds.has(li.projectId)
  );
  if (hasUnauthorizedLineItem || !hasAnyAuthorizedLineItem) return null;

  return invoice;
}
