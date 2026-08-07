import "server-only";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";

export function generateShareToken() {
  return randomBytes(24).toString("base64url");
}

export async function getProjectByShareToken(token: string) {
  const project = await prisma.project.findUnique({
    where: { shareToken: token },
    include: {
      client: true,
      org: true,
      milestones: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
    },
  });
  if (!project) return null;

  const [loggedAgg, billedAgg, paidAgg, invoices] = await Promise.all([
    prisma.timeEntry.aggregate({ where: { projectId: project.id }, _sum: { hours: true } }),
    prisma.invoiceLineItem.aggregate({
      where: { projectId: project.id, invoice: { status: { in: ["SENT", "PAID"] } } },
      _sum: { amount: true },
    }),
    prisma.invoiceLineItem.aggregate({
      where: { projectId: project.id, invoice: { status: "PAID" } },
      _sum: { amount: true },
    }),
    // A client should only ever see invoices that have actually been sent —
    // never drafts — and a project-scoped link only shows invoices with a
    // line item on this project. An invoice that ALSO touches a confidential
    // project is excluded entirely (not just its PDF) so its total, which
    // would include the confidential portion, never surfaces in the list —
    // mirrors the authorization check in getShareTokenInvoiceIfAuthorized.
    prisma.invoice.findMany({
      where: {
        status: { in: ["SENT", "PAID"] },
        lineItems: { some: { projectId: project.id } },
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
      },
      orderBy: { issueDate: "desc" },
    }),
  ]);

  return {
    project,
    loggedHours: Number(loggedAgg._sum.hours ?? 0),
    totalBilled: Number(billedAgg._sum.amount ?? 0),
    totalPaid: Number(paidAgg._sum.amount ?? 0),
    invoices,
  };
}

export async function getShareTokenInvoiceIfAuthorized(token: string, invoiceId: string) {
  const project = await prisma.project.findUnique({ where: { shareToken: token } });
  if (!project) return null;

  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: { client: true, org: true, lineItems: { orderBy: { sortOrder: "asc" } } },
  });
  if (!invoice) return null;
  if (invoice.status !== "SENT" && invoice.status !== "PAID") return null;

  const hasLineItemOnProject = invoice.lineItems.some((li) => li.projectId === project.id);
  if (!hasLineItemOnProject) return null;

  // An invoice can combine line items from several of the client's projects.
  // A per-project link authorizes seeing this project's line items, but an
  // invoice that also touches a *confidential* project shouldn't leak that
  // project's line items just because it shares an invoice with this one.
  const otherProjectIds = [
    ...new Set(
      invoice.lineItems
        .map((li) => li.projectId)
        .filter((id): id is string => id != null && id !== project.id)
    ),
  ];
  if (otherProjectIds.length > 0) {
    const otherProjects = await prisma.project.findMany({
      where: { id: { in: otherProjectIds } },
      select: { confidential: true },
    });
    if (otherProjects.some((p) => p.confidential)) return null;
  }

  return invoice;
}
