import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { readFile } from "@/lib/file-storage";
import { renderInvoicePdf } from "@/lib/invoice-pdf";
import { csvRow } from "@/lib/portability/csv";
import type { ZipEntry } from "@/lib/portability/zip";

// Full-organization and per-client data export: one CSV and one JSON file
// per model, the uploaded files themselves, and every invoice as a PDF.
//
// Every model is one row in EXPORT_MODELS below. Columns are an allowlist
// (`fields`), never "everything": share tokens, password hashes, TOTP
// secrets, API key hashes, OAuth tokens, webhook URLs and encrypted
// credentials are simply never listed — and SECRET_FIELD drops anything
// that looks like one even if it is. Fields that don't exist in the current
// schema are skipped, and a model that doesn't exist at all is left out, so
// the table can name models before (or after) they're in the schema.

export type ExportScope = { orgId: string; clientId?: string };

type Where = Record<string, unknown>;

type ExportModel = {
  /** Prisma model name, e.g. "TimeEntry". */
  model: string;
  /** File name in the archive: data/<file>.csv and data/<file>.json. */
  file: string;
  fields: string[];
  /** Narrower column list for a per-client export (handover to a client). */
  clientFields?: string[];
  /** Calendar-day columns (@db.Date), written as YYYY-MM-DD. */
  dates?: string[];
  /** Related values to include, flattened to "relation.field" columns. */
  related?: Record<string, string[]>;
  /** Rows in this scope, or null to leave the model out of it. */
  where: (s: ExportScope) => Where | null;
  /** An uploaded file on each row, copied into files/<dir>/. */
  upload?: { orgOnly?: boolean; dir: string; data: string; key?: string; name: string; type?: string; present: Where };
};

const org = (s: ExportScope) => ({ orgId: s.orgId });
const orgOnly = (s: ExportScope) => (s.clientId ? null : { orgId: s.orgId });
/** For models with orgId + clientId columns (Project, Invoice, …). */
const clientProjects = (s: ExportScope) =>
  s.clientId ? { orgId: s.orgId, clientId: s.clientId } : { orgId: s.orgId };
/** For a relation to Client itself. */
const theClient = (s: ExportScope) => (s.clientId ? { orgId: s.orgId, id: s.clientId } : { orgId: s.orgId });

export const EXPORT_MODELS: ExportModel[] = [
  {
    model: "Client",
    file: "clients",
    fields: [
      "id", "name", "website", "description", "email", "phone", "address", "billingEmail",
      "billingAddress", "status", "paymentTerms", "invoiceReminders", "useOrgPaymentMethods",
      "shareExpiresAt", "shareVerification", "createdAt", "updatedAt",
    ],
    where: (s) => (s.clientId ? { orgId: s.orgId, id: s.clientId } : org(s)),
  },
  {
    model: "Contact",
    file: "contacts",
    fields: ["id", "clientId", "name", "email", "phone", "title", "contactRole", "isPrimary", "receivesInvoices", "createdAt"],
    where: (s) => ({ client: theClient(s) }),
  },
  // Who verified on a client's share links (never the session token). Org
  // export only. ShareCode and RateLimitHit are short-lived and not exported.
  {
    model: "ShareSession",
    file: "share-sessions",
    fields: ["id", "clientId", "contactId", "email", "expiresAt", "lastSeenAt", "createdAt"],
    where: (s) => (s.clientId ? null : { client: { orgId: s.orgId } }),
  },
  {
    model: "Link",
    file: "links",
    fields: ["id", "label", "url", "type", "clientId", "projectId", "createdAt"],
    where: (s) => ({ OR: [{ client: theClient(s) }, { project: clientProjects(s) }] }),
  },
  {
    model: "Project",
    file: "projects",
    fields: [
      "id", "clientId", "name", "description", "status", "startDate", "endDate", "confidential",
      "budgetHours", "billingType", "flatFeeAmount", "paymentTerms", "shareTasks", "shareExpiresAt", "createdAt", "updatedAt",
    ],
    where: (s) => (s.clientId ? { orgId: s.orgId, clientId: s.clientId } : org(s)),
  },
  {
    model: "Membership",
    file: "members",
    fields: [
      "id", "userId", "role", "employmentType", "costRate", "billRate", "title", "bio",
      "resumeFileName", "resumeContentType", "createdAt",
    ],
    clientFields: ["id", "userId", "role", "employmentType", "title"],
    related: { user: ["name", "email"] },
    where: (s) =>
      s.clientId
        ? {
            orgId: s.orgId,
            user: {
              OR: [
                { projectMembers: { some: { project: { orgId: s.orgId, clientId: s.clientId } } } },
                { timeEntries: { some: { orgId: s.orgId, project: { clientId: s.clientId } } } },
              ],
            },
          }
        : org(s),
    upload: {
      // Résumés stay out of a client handover.
      orgOnly: true,
      dir: "resumes",
      data: "resumeFileData",
      name: "resumeFileName",
      type: "resumeContentType",
      present: { resumeFileData: { not: null } },
    },
  },
  {
    model: "ProjectMember",
    file: "project-members",
    fields: ["id", "projectId", "userId", "billRate", "currency", "approvalStatus", "approvalRequestedAt", "approvalRespondedAt", "createdAt"],
    where: (s) => ({ project: clientProjects(s) }),
  },
  {
    model: "Milestone",
    file: "milestones",
    fields: [
      "id", "projectId", "name", "description", "amount", "billable", "dueDate", "sortOrder", "completedAt",
      "completedById", "completionNote", "completionUrl", "completionFileName",
      "completionFileContentType", "invoiceLineItemId", "invoicedAt", "createdAt", "updatedAt",
    ],
    dates: ["dueDate"],
    where: (s) => ({ project: clientProjects(s) }),
    upload: {
      dir: "milestones",
      data: "completionFileData",
      key: "completionStorageKey",
      name: "completionFileName",
      type: "completionFileContentType",
      present: { OR: [{ completionFileData: { not: null } }, { completionStorageKey: { not: null } }] },
    },
  },
  {
    model: "Task",
    file: "tasks",
    fields: ["id", "projectId", "title", "description", "status", "estimatedHours", "dueDate", "assigneeId", "createdAt", "updatedAt"],
    dates: ["dueDate"],
    where: (s) => ({ project: clientProjects(s) }),
  },
  {
    model: "TaskComment",
    file: "task-comments",
    fields: ["id", "taskId", "authorId", "body", "source", "externalUrl", "externalAuthor", "sharedWithClient", "createdAt", "updatedAt"],
    where: (s) => ({ task: { project: clientProjects(s) } }),
  },
  {
    model: "TimeEntry",
    file: "time-entries",
    fields: [
      "id", "date", "hours", "description", "billable", "rateOverride", "approvedAt", "projectId",
      "userId", "taskId", "invoiceLineItemId", "createdAt", "updatedAt",
    ],
    dates: ["date"],
    related: { project: ["name"], user: ["name"] },
    where: (s) => (s.clientId ? { orgId: s.orgId, project: { clientId: s.clientId } } : org(s)),
  },
  {
    model: "Timesheet",
    file: "timesheets",
    fields: ["id", "userId", "weekStart", "status", "note", "submittedAt", "reviewedAt", "reviewedById", "createdAt"],
    dates: ["weekStart"],
    where: orgOnly,
  },
  {
    // Who has a calendar subscription — never its token (hash).
    model: "CalendarSubscription",
    file: "calendar-subscriptions",
    fields: ["id", "userId", "createdAt", "lastFetchedAt"],
    where: orgOnly,
  },
  {
    model: "Expense",
    file: "expenses",
    fields: [
      "id", "projectId", "description", "category", "amount", "incurredAt", "status", "submittedById",
      "approvedById", "approvedAt", "receiptFileName", "receiptContentType", "invoiceLineItemId",
      "invoicedAt", "createdAt", "updatedAt",
    ],
    dates: ["incurredAt"],
    where: (s) => (s.clientId ? { orgId: s.orgId, project: { clientId: s.clientId } } : org(s)),
    upload: {
      dir: "receipts",
      data: "receiptFileData",
      key: "receiptStorageKey",
      name: "receiptFileName",
      type: "receiptContentType",
      present: { OR: [{ receiptFileData: { not: null } }, { receiptStorageKey: { not: null } }] },
    },
  },
  {
    model: "Invoice",
    file: "invoices",
    fields: [
      "id", "number", "kind", "clientId", "status", "issueDate", "dueDate", "paymentTerms", "poNumber",
      "paymentMethod", "paidAt", "subtotal", "taxRate", "taxAmount", "total", "amountPaid", "creditApplied", "currency", "notes",
      "retainerHoursIncluded", "recurringScheduleId", "firstViewedAt", "lastViewedAt", "viewCount",
      "scheduledSendAt", "createdAt", "updatedAt",
    ],
    dates: ["issueDate", "dueDate"],
    where: clientProjects,
  },
  {
    model: "InvoiceLineItem",
    file: "invoice-line-items",
    fields: ["id", "invoiceId", "projectId", "description", "quantity", "rate", "amount", "sortOrder"],
    where: (s) => ({ invoice: clientProjects(s) }),
  },
  {
    model: "InvoiceEvent",
    file: "invoice-events",
    fields: ["id", "invoiceId", "type", "recipients", "detail", "actorId", "createdAt"],
    where: (s) => ({ invoice: clientProjects(s) }),
  },
  {
    model: "Payment",
    file: "payments",
    fields: ["id", "invoiceId", "clientId", "amount", "currency", "receivedAt", "source", "method", "reference", "note", "recordedById", "createdAt"],
    dates: ["receivedAt"],
    where: clientProjects,
  },
  {
    model: "CreditNote",
    file: "credit-notes",
    fields: ["id", "number", "clientId", "invoiceId", "amount", "currency", "reason", "issueDate", "status", "voidedAt", "createdById", "createdAt"],
    dates: ["issueDate"],
    where: clientProjects,
  },
  {
    model: "CreditApplication",
    file: "credit-applications",
    fields: ["id", "invoiceId", "clientId", "amount", "currency", "note", "appliedById", "createdAt"],
    where: clientProjects,
  },
  {
    model: "Estimate",
    file: "estimates",
    fields: [
      "id", "number", "clientId", "projectId", "title", "intro", "status", "issueDate", "expiresAt",
      "currency", "subtotal", "taxRate", "taxAmount", "total", "proposedBillingType", "proposedRate",
      "proposedBudget", "sentAt", "respondedAt", "responderName", "responseNote", "respondedById",
      "projectCreatedAt", "createdAt", "updatedAt",
    ],
    dates: ["issueDate", "expiresAt"],
    where: clientProjects,
  },
  {
    model: "EstimateLineItem",
    file: "estimate-line-items",
    fields: ["id", "estimateId", "description", "quantity", "rate", "amount", "sortOrder", "isMilestone", "milestoneDueDate", "milestoneDueDays"],
    dates: ["milestoneDueDate"],
    where: (s) => ({ estimate: clientProjects(s) }),
  },
  {
    model: "Agreement",
    file: "agreements",
    fields: [
      "id", "provider", "externalId", "title", "status", "signedAt", "signers", "externalUrl",
      "fileName", "contentType", "sizeBytes", "clientId", "projectId", "linkedAt", "createdAt", "updatedAt",
    ],
    where: (s) => (s.clientId ? { orgId: s.orgId, clientId: s.clientId } : org(s)),
    upload: {
      dir: "agreements",
      data: "fileData",
      key: "storageKey",
      name: "fileName",
      type: "contentType",
      present: { OR: [{ fileData: { not: null } }, { storageKey: { not: null } }] },
    },
  },
  {
    // Links to password-manager items — never secrets, but they map out the
    // vault (account, vault and item ids), so they're in the owner-only full
    // export and left out of a per-client export (a handover to the client).
    model: "VaultLink",
    file: "vault-links",
    fields: ["id", "clientId", "projectId", "label", "provider", "itemKind", "url", "note", "createdById", "createdAt", "updatedAt"],
    where: orgOnly,
  },
  {
    model: "ClientDocument",
    file: "documents",
    fields: [
      "id", "clientId", "projectId", "type", "label", "access", "audience", "source", "fileName",
      "contentType", "sizeBytes", "externalUrl", "externalKind", "externalModifiedAt", "uploadedById",
      "uploadedAt",
    ],
    where: (s) => ({ client: theClient(s) }),
    upload: {
      dir: "documents",
      data: "fileData",
      key: "storageKey",
      name: "fileName",
      type: "contentType",
      present: { source: "UPLOAD", OR: [{ fileData: { not: null } }, { storageKey: { not: null } }] },
    },
  },
  {
    model: "RecurringInvoiceSchedule",
    file: "recurring-invoices",
    fields: ["id", "clientId", "description", "amount", "interval", "dueInDays", "retainerHours", "active", "autoSend", "nextRunAt", "lastRunAt", "createdAt", "updatedAt"],
    where: clientProjects,
  },
  {
    model: "ClientBillingCycle",
    file: "billing-cycles",
    fields: ["id", "clientId", "interval", "anchorDay", "paymentTerms", "autoSend", "active", "nextRunAt", "lastRunAt", "createdAt", "updatedAt"],
    where: clientProjects,
  },
  {
    // The org's own payment details (bank, links) — whole-org export only.
    model: "PaymentMethod",
    file: "payment-methods",
    fields: ["id", "clientId", "type", "label", "details", "showOnPdf", "sortOrder", "createdAt", "updatedAt"],
    where: orgOnly,
  },
  {
    model: "ImportBatch",
    file: "imports",
    fields: ["id", "source", "kind", "fileName", "rowCount", "entriesCreated", "clientsCreated", "projectsCreated", "rowsSkipped", "createdById", "undoneAt", "createdAt"],
    where: orgOnly,
  },
  {
    model: "AuditLog",
    file: "audit-log",
    fields: ["id", "createdAt", "actorId", "via", "action", "entityType", "entityId", "entityLabel", "count", "changes", "ipAddress", "userAgent"],
    where: orgOnly,
  },
];

const ORGANIZATION_FIELDS = [
  "id", "name", "slug", "domain", "defaultCurrency", "defaultTaxRate", "defaultBillRate",
  "invoicePrefix", "defaultPaymentTerms", "overheadPercent", "timesheetApproval",
  "expenseApprovalThreshold", "brandColor", "requireTwoFactor", "requireShareVerification", "createdAt",
];

/** Never exported, whatever a table row says. */
const SECRET_FIELD = /token|secret|hash|password|recoverycode|credential|apikey|webhook|storagekey|filedata|publickey/i;

const PAGE = 500;

type Row = Record<string, unknown>;
type Delegate = { findMany(args: unknown): Promise<Row[]> };

function delegateFor(model: string): Delegate | null {
  const name = model.charAt(0).toLowerCase() + model.slice(1);
  const d = (prisma as unknown as Record<string, Delegate | undefined>)[name];
  return d && typeof d.findMany === "function" ? d : null;
}

/** The model's columns in this schema, or null if the model isn't in it. */
function schemaFields(model: string): Set<string> | null {
  const e = (Prisma as unknown as Record<string, Record<string, string> | undefined>)[`${model}ScalarFieldEnum`];
  return e ? new Set(Object.values(e)) : null;
}

function columnsFor(m: ExportModel, scope: ExportScope) {
  const available = schemaFields(m.model);
  if (!available || !delegateFor(m.model)) return null;
  const wanted = (scope.clientId && m.clientFields) || m.fields;
  const fields = wanted.filter((f) => available.has(f) && !SECRET_FIELD.test(f));
  if (!fields.includes("id")) return null; // paging needs it
  const related = Object.entries(m.related ?? {}).map(([rel, cols]) => ({
    rel,
    cols: cols.filter((c) => !SECRET_FIELD.test(c)),
  }));
  const select: Record<string, unknown> = Object.fromEntries(fields.map((f) => [f, true]));
  for (const { rel, cols } of related) select[rel] = { select: Object.fromEntries(cols.map((c) => [c, true])) };
  const header = [...fields, ...related.flatMap(({ rel, cols }) => cols.map((c) => `${rel}.${c}`))];
  if (m.upload) header.push("exportedFile");
  return { fields, related, select, header };
}

/** Pages through a model by id, PAGE rows at a time. */
async function* pages(delegate: Delegate, where: Where, select: Record<string, unknown>, first?: Row[]) {
  let batch = first ?? (await delegate.findMany({ where, select, orderBy: { id: "asc" }, take: PAGE }));
  while (batch.length > 0) {
    yield batch;
    if (batch.length < PAGE) return;
    const last = batch[batch.length - 1].id as string;
    batch = await delegate.findMany({
      where: { AND: [where, { id: { gt: last } }] },
      select,
      orderBy: { id: "asc" },
      take: PAGE,
    });
  }
}

/** Json columns (audit-log changes, signers…): drops values under any key
 * that names a secret — older audit entries can hold e.g. a webhook URL. */
function redactJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactJson);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Row).map(([k, v]) => [k, SECRET_FIELD.test(k) ? "[redacted]" : redactJson(v)])
    );
  }
  return value;
}

function plainValue(value: unknown, dateOnly: boolean): unknown {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return dateOnly ? value.toISOString().slice(0, 10) : value.toISOString();
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Uint8Array) return null;
  if (typeof value === "object" && value !== null && "toFixed" in value && !Array.isArray(value)) {
    return String(value); // Prisma Decimal, exact
  }
  if (typeof value === "object") return redactJson(value);
  return value;
}

function lastLine(err: unknown) {
  return String((err as Error)?.message ?? err).split("\n").map((l) => l.trim()).filter(Boolean).pop() ?? "unknown error";
}

function fileNameSafe(name: string) {
  return name.replace(/[/\\\x00-\x1f\x7f:*?"<>|]+/g, "_").slice(-120) || "file";
}

function exportedFilePath(m: ExportModel, row: Row) {
  if (!m.upload) return null;
  const name = row[m.upload.name];
  return typeof name === "string" && name ? `files/${m.upload.dir}/${row.id}-${fileNameSafe(name)}` : null;
}

function flatten(m: ExportModel, cols: NonNullable<ReturnType<typeof columnsFor>>, row: Row, hasFile: Set<string>) {
  const dates = new Set(m.dates ?? []);
  const out: Row = {};
  for (const f of cols.fields) out[f] = plainValue(row[f], dates.has(f));
  for (const { rel, cols: relCols } of cols.related) {
    const r = row[rel] as Row | null | undefined;
    for (const c of relCols) out[`${rel}.${c}`] = plainValue(r?.[c], false);
  }
  if (m.upload) out.exportedFile = hasFile.has(row.id as string) ? exportedFilePath(m, row) : null;
  return out;
}

async function* csvRows(header: string[], rows: AsyncIterable<Row[]>) {
  yield csvRow(header);
  for await (const page of rows) {
    yield page.map((r) => csvRow(header.map((h) => r[h]))).join("");
  }
}

async function* jsonRows(rows: AsyncIterable<Row[]>) {
  yield "[";
  let first = true;
  for await (const page of rows) {
    let chunk = "";
    for (const r of page) {
      chunk += `${first ? "\n" : ",\n"}  ${JSON.stringify(r)}`;
      first = false;
    }
    yield chunk;
  }
  yield first ? "]\n" : "\n]\n";
}

export type ExportSummary = { files: Record<string, number>; uploads: number; invoicePdfs: number; errors: string[] };

/**
 * The archive's entries, produced lazily: each model is read a page at a
 * time while its CSV/JSON is being written, and each uploaded file or
 * invoice PDF is loaded only when its turn comes.
 */
export async function* exportEntries(
  scope: ExportScope,
  meta: { orgName: string; clientName?: string; exportedBy: string; appVersion?: string }
): AsyncGenerator<ZipEntry> {
  const now = new Date();
  const summary: ExportSummary = { files: {}, uploads: 0, invoicePdfs: 0, errors: [] };

  yield {
    name: "README.txt",
    data: new Uint8Array(Buffer.from(readme(scope, meta, now), "utf8")),
    modified: now,
  };

  if (!scope.clientId) {
    const orgRow = await prisma.organization.findUnique({
      where: { id: scope.orgId },
      select: Object.fromEntries(
        ORGANIZATION_FIELDS.filter((f) => schemaFields("Organization")?.has(f) && !SECRET_FIELD.test(f)).map((f) => [f, true])
      ),
    });
    const flat = Object.fromEntries(Object.entries(orgRow ?? {}).map(([k, v]) => [k, plainValue(v, false)]));
    yield { name: "data/organization.json", data: new Uint8Array(Buffer.from(JSON.stringify(flat, null, 2) + "\n")), modified: now };
    yield {
      name: "data/organization.csv",
      data: new Uint8Array(Buffer.from(csvRow(Object.keys(flat)) + csvRow(Object.values(flat)))),
      modified: now,
    };
  }

  for (const listed of EXPORT_MODELS) {
    const m = listed.upload?.orgOnly && scope.clientId ? { ...listed, upload: undefined } : listed;
    const where = m.where(scope);
    const cols = where ? columnsFor(m, scope) : null;
    if (!where || !cols) continue;
    const delegate = delegateFor(m.model)!;

    // Which rows have a stored file (so the CSV can point at it).
    const hasFile = new Set<string>();
    const upload = m.upload;
    if (upload) {
      try {
        for await (const page of pages(delegate, { AND: [where, upload.present] }, { id: true })) {
          for (const r of page) hasFile.add(r.id as string);
        }
      } catch (err) {
        summary.errors.push(`${m.file}: couldn't list files (${lastLine(err)})`);
      }
    }

    // First page up front, so a query that fails (schema drift) skips the
    // model cleanly instead of breaking the archive mid-file.
    let first: Row[];
    try {
      first = await delegate.findMany({ where, select: cols.select, orderBy: { id: "asc" }, take: PAGE });
    } catch (err) {
      summary.errors.push(`${m.file}: not exported (${lastLine(err)})`);
      continue;
    }

    let count = 0;
    const flatPages = async function* () {
      for await (const page of pages(delegate, where, cols.select, first)) {
        count += page.length;
        yield page.map((r) => flatten(m, cols, r, hasFile));
      }
    };
    yield { name: `data/${m.file}.csv`, data: csvRows(cols.header, flatPages()), modified: now };
    summary.files[m.file] = count;
    yield { name: `data/${m.file}.json`, data: jsonRows(flatPages()), modified: now };

    // The files themselves, one at a time.
    if (upload && hasFile.size > 0) {
      const f = upload;
      const fileSelect: Record<string, boolean> = { id: true, [f.data]: true, [f.name]: true };
      if (f.key) fileSelect[f.key] = true;
      for (const id of hasFile) {
        try {
          const row = (await delegate.findMany({ where: { id }, select: fileSelect, take: 1 }))[0];
          if (!row) continue;
          const bytes = await readFile({
            fileData: (row[f.data] as Uint8Array | null) ?? null,
            storageKey: f.key ? ((row[f.key] as string | null) ?? null) : null,
          });
          const path = exportedFilePath(m, row);
          if (!bytes || !path) {
            summary.errors.push(`${path ?? id}: the stored file couldn't be read`);
            continue;
          }
          summary.uploads++;
          yield { name: path, data: new Uint8Array(bytes), modified: now };
        } catch (err) {
          summary.errors.push(`files/${f.dir}/${id}: ${(err as Error).message}`);
        }
      }
    }
  }

  // Invoice PDFs, rendered one at a time.
  const invoiceWhere = scope.clientId ? { orgId: scope.orgId, clientId: scope.clientId } : { orgId: scope.orgId };
  for await (const page of pages(delegateFor("Invoice")!, invoiceWhere, { id: true, number: true })) {
    for (const inv of page) {
      try {
        const invoice = await prisma.invoice.findFirst({
          where: { id: inv.id as string, orgId: scope.orgId },
          include: {
            client: true,
            org: true,
            lineItems: { orderBy: { sortOrder: "asc" }, include: { timeEntries: { select: { id: true } } } },
          },
        });
        if (!invoice) continue;
        const pdf = await renderInvoicePdf(invoice);
        summary.invoicePdfs++;
        yield { name: `invoices/${fileNameSafe(invoice.number)}.pdf`, data: new Uint8Array(pdf), modified: now };
      } catch (err) {
        summary.errors.push(`invoices/${inv.number}.pdf: ${(err as Error).message}`);
      }
    }
  }

  yield {
    name: "manifest.json",
    data: new Uint8Array(
      Buffer.from(
        JSON.stringify(
          {
            exportedAt: now.toISOString(),
            exportedBy: meta.exportedBy,
            organization: meta.orgName,
            client: meta.clientName ?? null,
            appVersion: meta.appVersion ?? null,
            rows: summary.files,
            uploadedFiles: summary.uploads,
            invoicePdfs: summary.invoicePdfs,
            problems: summary.errors,
          },
          null,
          2
        ) + "\n"
      )
    ),
    modified: now,
  };
}

function readme(
  scope: ExportScope,
  meta: { orgName: string; clientName?: string; exportedBy: string },
  now: Date
) {
  const what = scope.clientId
    ? `Records for the client "${meta.clientName}" of ${meta.orgName}`
    : `Everything in the organization ${meta.orgName}`;
  return [
    `${what}, exported from Consultainer on ${now.toISOString()} by ${meta.exportedBy}.`,
    "",
    "data/       One CSV and one JSON file per kind of record. Both hold the same rows;",
    "            JSON keeps exact values, CSV is for spreadsheets (text starting with",
    "            =, +, - or @ gets a leading ' so it isn't run as a formula).",
    "            Records refer to each other by id (projectId, clientId, userId...).",
    "            Money and hours are exact decimals; dates are YYYY-MM-DD, times UTC.",
    "files/      Uploaded files: documents, expense receipts, milestone evidence",
    "            and more. The exportedFile column of each CSV points here.",
    "invoices/   Every invoice as a PDF, as it renders today.",
    "manifest.json  Row counts, and anything that couldn't be exported.",
    "",
    "Not included, on purpose: passwords, two-factor secrets, API keys, share and",
    "invoice links, integration tokens and credentials, and webhook URLs.",
    "",
  ].join("\n");
}
