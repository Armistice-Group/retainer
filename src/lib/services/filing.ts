import "server-only";
import { prisma } from "@/lib/prisma";
import { renderInvoicePdf } from "@/lib/invoice-pdf";
import { readFile } from "@/lib/file-storage";
import { accessTokenFor } from "@/lib/integrations/storage/connections";
import {
  FILING_PROVIDERS,
  FILING_TARGETS,
  type FilingProviderId,
} from "@/lib/integrations/storage/filing-targets";
import { ProviderError } from "@/lib/integrations/storage/types";
import type { Organization } from "@/generated/prisma/client";

// Auto-filing: copies of invoice PDFs and uploaded client documents go into
// the org's chosen Drive/Dropbox/OneDrive folder as
//   <root>/<Client>/Invoices/<INV-0001>.pdf
//   <root>/<Client>/Documents/<file>            (client-wide documents)
//   <root>/<Client>/<Project>/Documents/<file>  (a project's documents)
// through the connection of the admin who set it up. Each item is filed when
// it happens and an hourly job catches up on anything that failed.

export class FilingError extends Error {}

type FilingOrg = Pick<
  Organization,
  "id" | "filingProvider" | "filingConnectionId" | "filingRootId" | "fileInvoices" | "fileDocuments"
>;

export async function setUpFiling(
  ctx: { orgId: string; actorId: string },
  input: { provider: string; rootName: string; fileInvoices: boolean; fileDocuments: boolean }
) {
  if (!(FILING_PROVIDERS as string[]).includes(input.provider)) throw new FilingError("Choose Google Drive, Dropbox or OneDrive.");
  const provider = input.provider as FilingProviderId;
  const connection = await prisma.userConnection.findUnique({
    where: { userId_provider: { userId: ctx.actorId, provider } },
  });
  if (!connection) throw new FilingError("Connect that service on your profile first — filing uses your connection.");
  const rootName = input.rootName.trim() || "Consultainer";
  try {
    const root = await FILING_TARGETS[provider].prepareRoot(await accessTokenFor(connection), rootName);
    await prisma.organization.update({
      where: { id: ctx.orgId },
      data: {
        filingProvider: provider,
        filingConnectionId: connection.id,
        filingRootId: root.rootId,
        filingRootUrl: root.url,
        filingRootName: rootName,
        fileInvoices: input.fileInvoices,
        fileDocuments: input.fileDocuments,
        filingLastError: null,
      },
    });
  } catch (err) {
    if (err instanceof ProviderError) throw new FilingError(`Couldn't create the folder: ${err.message}`);
    throw err;
  }
}

export async function updateFilingOptions(orgId: string, input: { fileInvoices: boolean; fileDocuments: boolean }) {
  await prisma.organization.update({ where: { id: orgId }, data: input });
}

export async function turnOffFiling(orgId: string) {
  await prisma.organization.update({
    where: { id: orgId },
    data: { filingProvider: null, filingConnectionId: null, filingRootId: null, filingRootUrl: null, filingLastError: null },
  });
}

async function target(org: FilingOrg) {
  if (!org.filingProvider || !org.filingRootId || !org.filingConnectionId) return null;
  const connection = await prisma.userConnection.findUnique({ where: { id: org.filingConnectionId } });
  if (!connection) {
    throw new FilingError("The account filing was set up with has been disconnected — set filing up again.");
  }
  return {
    provider: org.filingProvider as FilingProviderId,
    impl: FILING_TARGETS[org.filingProvider as FilingProviderId],
    token: await accessTokenFor(connection),
    rootId: org.filingRootId,
  };
}

async function record(orgId: string, kind: string, sourceId: string, provider: string, filed: { id: string; url: string | null }) {
  await prisma.filedCopy.upsert({
    where: { kind_sourceId_provider: { kind, sourceId, provider } },
    create: { orgId, kind, sourceId, provider, externalId: filed.id, externalUrl: filed.url },
    update: { externalId: filed.id, externalUrl: filed.url, filedAt: new Date() },
  });
}

async function noteError(orgId: string, err: unknown) {
  const message =
    err instanceof FilingError || err instanceof ProviderError ? err.message : "Filing failed — will retry within the hour.";
  if (!(err instanceof FilingError || err instanceof ProviderError)) console.warn("[filing]", err);
  await prisma.organization.update({ where: { id: orgId }, data: { filingLastError: message.slice(0, 300) } });
}

async function filingOrg(orgId: string) {
  return prisma.organization.findUnique({
    where: { id: orgId },
    select: { id: true, filingProvider: true, filingConnectionId: true, filingRootId: true, fileInvoices: true, fileDocuments: true },
  });
}

/** Files (or refreshes) an invoice's PDF. Best effort: never throws. */
export async function fileInvoice(invoiceId: string) {
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: {
      client: true,
      org: true,
      lineItems: { orderBy: { sortOrder: "asc" }, include: { timeEntries: { select: { id: true } } } },
    },
  });
  if (!invoice || invoice.status === "DRAFT") return;
  const org = await filingOrg(invoice.orgId);
  if (!org?.fileInvoices) return;
  try {
    const t = await target(org);
    if (!t) return;
    const existing = await prisma.filedCopy.findUnique({
      where: { kind_sourceId_provider: { kind: "INVOICE", sourceId: invoice.id, provider: t.provider } },
    });
    const pdf = await renderInvoicePdf(invoice);
    const filed = await t.impl.putFile(t.token, t.rootId, [invoice.client.name, "Invoices"], {
      name: `${invoice.number}.pdf`,
      bytes: new Uint8Array(pdf),
      contentType: "application/pdf",
      existingId: existing?.externalId,
    });
    await record(org.id, "INVOICE", invoice.id, t.provider, filed);
  } catch (err) {
    await noteError(org.id, err);
  }
}

/** Files an uploaded document. Best effort: never throws. */
export async function fileDocument(documentId: string) {
  const doc = await prisma.clientDocument.findUnique({
    where: { id: documentId },
    include: { client: true, project: { select: { name: true } } },
  });
  if (!doc || doc.source !== "UPLOAD") return;
  const org = await filingOrg(doc.client.orgId);
  if (!org?.fileDocuments) return;
  try {
    const t = await target(org);
    if (!t) return;
    const bytes = await readFile(doc);
    if (!bytes) return;
    const ext = doc.fileName.match(/\.[a-z0-9]{1,6}$/i)?.[0] ?? "";
    const name = doc.label ? (doc.label.toLowerCase().endsWith(ext.toLowerCase()) ? doc.label : `${doc.label}${ext}`) : doc.fileName;
    const filed = await t.impl.putFile(
      t.token,
      t.rootId,
      doc.project ? [doc.client.name, doc.project.name, "Documents"] : [doc.client.name, "Documents"],
      { name, bytes, contentType: doc.contentType ?? "application/octet-stream" }
    );
    await record(org.id, "DOCUMENT", doc.id, t.provider, filed);
  } catch (err) {
    await noteError(org.id, err);
  }
}

/** Hourly: anything not filed yet (or changed since), for every org that files. */
export async function catchUpFiling(onlyOrgId?: string) {
  const orgs = await prisma.organization.findMany({
    where: { filingProvider: { not: null }, filingRootId: { not: null }, ...(onlyOrgId ? { id: onlyOrgId } : {}) },
    select: { id: true, filingProvider: true, fileInvoices: true, fileDocuments: true },
  });
  let filed = 0;
  for (const org of orgs) {
    const copies = await prisma.filedCopy.findMany({
      where: { orgId: org.id, provider: org.filingProvider! },
      select: { kind: true, sourceId: true, filedAt: true },
    });
    const filedAt = new Map(copies.map((c) => [`${c.kind}:${c.sourceId}`, c.filedAt]));
    if (org.fileInvoices) {
      const invoices = await prisma.invoice.findMany({
        where: { orgId: org.id, status: { in: ["SENT", "PAID", "VOID"] } },
        select: { id: true, updatedAt: true },
      });
      for (const inv of invoices) {
        const at = filedAt.get(`INVOICE:${inv.id}`);
        if (at && at >= inv.updatedAt) continue;
        await fileInvoice(inv.id);
        filed++;
      }
    }
    if (org.fileDocuments) {
      const docs = await prisma.clientDocument.findMany({
        where: { client: { orgId: org.id }, source: "UPLOAD" },
        select: { id: true },
      });
      for (const doc of docs) {
        if (filedAt.has(`DOCUMENT:${doc.id}`)) continue;
        await fileDocument(doc.id);
        filed++;
      }
    }
  }
  return { orgs: orgs.length, filed };
}
