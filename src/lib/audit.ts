import { AsyncLocalStorage } from "async_hooks";
import { createHash } from "crypto";
import type { PrismaClient } from "@/generated/prisma/client";

// Every write to these models lands in the org's audit log, attributed to
// whoever made the request (session user or API key). Models left out are
// either bookkeeping (notifications, timers, tokens, sync links) or rows that
// only ever change as part of an audited parent (invoice line items).
const LABEL_FIELDS = ["name", "title", "number", "email", "label", "fileName", "description", "body"];

export const AUDITED_MODELS = [
  "Organization",
  "Membership",
  "Invite",
  "User",
  "Authenticator",
  "ApiKey",
  "SsoConnection",
  "QuickBooksConnection",
  "MercuryConnection",
  "LinearConnection",
  "AgreementConnection",
  "Agreement",
  "VaultLink",
  "ExternalProjectLink",
  "Client",
  "Contact",
  "ClientDocument",
  "Link",
  "Project",
  "ProjectMember",
  "Milestone",
  "Task",
  "TaskComment",
  "TimeEntry",
  "Timesheet",
  "Expense",
  "Invoice",
  "Estimate",
  "RecurringInvoiceSchedule",
  "ClientBillingCycle",
  "PaymentMethod",
  "Payment",
  "CreditNote",
  "CreditApplication",
] as const;
const AUDITED = new Set<string>(AUDITED_MODELS);

// Fields whose changes alone aren't worth an entry.
const IGNORED_FIELDS = new Set([
  "updatedAt",
  "createdAt",
  "lastUsedAt",
  "lastSyncedAt",
  "setupCardDismissedAt",
  "budgetAlertLevel",
  "overEstimateAlertedAt",
  "dueSoonNotifiedAt",
  "overdueNotifiedAt",
  "approvedAt",
  // Bookkeeping the app updates on its own.
  "nextInvoiceNumber",
  "nextCreditNoteNumber",
  "nextEstimateNumber",
  "nextRunAt",
  "lastRunAt",
  "lastInvoiceId",
  "lastRunNote",
  "viewToken",
  "firstViewedAt",
  "lastViewedAt",
  "viewCount",
  "viewAlertedAt",
  "lastDigestAt",
  "lastSyncedAt",
  "lastError",
  "lastNudgedAt",
  "filingLastError",
  "syncCursor",
]);
// Recorded as "changed" without the value.
const REDACTED_PATTERN = /hash|secret|token|password|recoverycodes|filedata|credential|publickey|counter|webhook/i;
// Bank and payment details (account/routing numbers, IBANs): kept out of the
// log like secrets; the entry still shows that they changed. Billing-change
// alerts hide the same fields.
const REDACTED_FIELDS = new Set(["details", "paymentInstructions"]);
const REDACTED = { test: (key: string) => REDACTED_PATTERN.test(key) || REDACTED_FIELDS.has(key) };

type Actor = {
  userId: string | null;
  orgId: string | null;
  via: "web" | "api";
  ipAddress: string | null;
  userAgent: string | null;
};

// Set while the audit hook does its own lookups, so they never audit
// themselves (and so session resolution can't recurse into the hook).
const inAudit = new AsyncLocalStorage<true>();
const actorCache = new WeakMap<object, Promise<Actor | null>>();

async function resolveActor(base: PrismaClient): Promise<Actor | null> {
  let h: Headers;
  try {
    const { headers } = await import("next/headers");
    h = (await headers()) as unknown as Headers;
  } catch {
    return null; // Not inside a request: seed, cron script, background work.
  }
  const cached = actorCache.get(h);
  if (cached) return cached;

  const promise = (async (): Promise<Actor | null> => {
    const ipAddress =
      h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null;
    const userAgent = h.get("user-agent")?.slice(0, 300) ?? null;

    const bearer = h.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
    if (bearer) {
      const keyHash = createHash("sha256").update(bearer).digest("hex");
      const key = await base.apiKey.findUnique({ where: { keyHash } });
      if (key && !key.revokedAt) {
        return { userId: key.userId, orgId: key.orgId, via: "api", ipAddress, userAgent };
      }
    }

    try {
      const [{ auth }, { cookies }] = await Promise.all([
        import("@/lib/auth"),
        import("next/headers"),
      ]);
      const session = await auth();
      const userId = session?.user?.id;
      if (!userId) return { userId: null, orgId: null, via: "web", ipAddress, userAgent };
      const activeOrgId = (await cookies()).get("activeOrgId")?.value;
      const memberships = await base.membership.findMany({
        where: { userId },
        select: { orgId: true },
        orderBy: { createdAt: "asc" },
      });
      const orgId =
        memberships.find((m) => m.orgId === activeOrgId)?.orgId ?? memberships[0]?.orgId ?? null;
      return { userId, orgId, via: "web", ipAddress, userAgent };
    } catch {
      return { userId: null, orgId: null, via: "web", ipAddress, userAgent };
    }
  })();
  actorCache.set(h, promise);
  return promise;
}

type Row = Record<string, unknown>;

function isRow(value: unknown): value is Row {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function plain(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") return value.length > 500 ? `${value.slice(0, 500)}…` : value;
  if (typeof value === "number" || typeof value === "boolean") return value;
  // Objects inside arrays (Json columns, e.g. a list of signers) as JSON text.
  if (Array.isArray(value)) {
    if (value.length > 20) return `[${value.length} items]`;
    const items = value.map(stored);
    // An element with no scalar form (e.g. an included relation): not a column.
    return items.some((v) => v === undefined) ? undefined : items;
  }
  // Prisma Decimal
  if (typeof value === "object" && "toFixed" in value && typeof value.toString === "function") {
    return value.toString();
  }
  if (value instanceof Uint8Array) return "[binary]";
  return undefined; // Nested relation writes and other shapes: not a scalar change.
}

/** A column value as read back from a row: like plain(), but a plain object
 * there is a Json column, so it's kept (as text). */
function stored(value: unknown): unknown {
  if (isRow(value) && !(value instanceof Date) && !(value instanceof Uint8Array) && !("toFixed" in value)) {
    const text = JSON.stringify(value);
    return text.length > 500 ? `${text.slice(0, 500)}…` : text;
  }
  return plain(value);
}

function labelOf(row: Row | null | undefined) {
  if (!row) return null;
  for (const field of LABEL_FIELDS) {
    const v = row[field];
    if (typeof v === "string" && v.trim()) return v.length > 120 ? `${v.slice(0, 120)}…` : v;
  }
  return null;
}

/** Field-level diff of an update: only scalar fields the write touched and
 * that actually changed. */
function diff(data: Row, before: Row | null, after: Row | null) {
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const key of Object.keys(data)) {
    if (IGNORED_FIELDS.has(key)) continue;
    const to = after && key in after ? stored(after[key]) : plain(data[key]);
    if (to === undefined) continue;
    const from = stored(before?.[key]);
    if (JSON.stringify(from) === JSON.stringify(to)) continue;
    changes[key] = REDACTED.test(key)
      ? { from: "[redacted]", to: "[redacted]" }
      : { from: from ?? null, to };
  }
  return changes;
}

function snapshot(data: Row, row: Row | null = null) {
  const values: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(data)) {
    if (IGNORED_FIELDS.has(key)) continue;
    const v = row && key in row ? stored(row[key]) : plain(raw);
    if (v === undefined) continue;
    values[key] = REDACTED.test(key) ? "[redacted]" : v;
  }
  return values;
}

async function resolveOrgId(
  base: PrismaClient,
  model: string,
  row: Row | null,
  actor: Actor | null
): Promise<string | null> {
  if (model === "Organization" && typeof row?.id === "string") return row.id;
  if (typeof row?.orgId === "string") return row.orgId;
  if (actor?.orgId) return actor.orgId;
  // No request context (webhooks, cron): find the org through the parent.
  if (typeof row?.projectId === "string") {
    const p = await base.project.findUnique({ where: { id: row.projectId }, select: { orgId: true } });
    if (p) return p.orgId;
  }
  if (typeof row?.clientId === "string") {
    const c = await base.client.findUnique({ where: { id: row.clientId }, select: { orgId: true } });
    if (c) return c.orgId;
  }
  if (typeof row?.taskId === "string") {
    const t = await base.task.findUnique({
      where: { id: row.taskId },
      select: { project: { select: { orgId: true } } },
    });
    if (t) return t.project.orgId;
  }
  return null;
}

type QueryParams = {
  model?: string;
  operation: string;
  args: Row;
  query: (args: Row) => Promise<unknown>;
};

const SINGLE = new Set(["create", "update", "upsert", "delete"]);
const BULK = new Set([
  "createMany",
  "createManyAndReturn",
  "updateMany",
  "updateManyAndReturn",
  "deleteMany",
]);

/** Prisma query hook: runs the write, then records it. Recording never
 * fails the write — a broken audit insert is logged and swallowed. */
export async function auditedQuery(base: PrismaClient, params: QueryParams) {
  const { model, operation, args, query } = params;
  if (
    !model ||
    !AUDITED.has(model) ||
    (!SINGLE.has(operation) && !BULK.has(operation)) ||
    inAudit.getStore()
  ) {
    return query(args);
  }

  const delegate = (base as unknown as Record<string, { findUnique(a: unknown): Promise<Row | null> }>)[
    model.charAt(0).toLowerCase() + model.slice(1)
  ];
  let before: Row | null = null;
  if (operation === "update" || operation === "upsert") {
    before = await inAudit
      .run(true, () => delegate.findUnique({ where: args.where }))
      .catch(() => null);
  }

  const result = await query(args);

  try {
    await inAudit.run(true, async () => {
      const actor = await resolveActor(base);
      let action: string;
      let row: Row | null = isRow(result) ? result : null;
      let changes: unknown = null;
      let count: number | null = null;

      if (operation === "create" || (operation === "upsert" && !before)) {
        action = "create";
        changes = snapshot(
          isRow(args.data) ? args.data : isRow(args.create) ? args.create : {},
          row
        );
      } else if (operation === "update" || operation === "upsert") {
        action = "update";
        const data = isRow(args.data) ? args.data : isRow(args.update) ? args.update : {};
        const d = diff(data, before, row);
        if (Object.keys(d).length === 0) return; // A no-op write.
        changes = d;
      } else if (operation === "delete") {
        action = "delete";
      } else {
        action = operation.startsWith("create")
          ? "create"
          : operation.startsWith("update")
            ? "update"
            : "delete";
        count = Array.isArray(result)
          ? result.length
          : isRow(result) && typeof result.count === "number"
            ? result.count
            : null;
        if (count === 0) return;
        const data = Array.isArray(args.data) ? args.data[0] : args.data;
        if (action === "update" && isRow(data)) changes = snapshot(data);
        row = Array.isArray(result) && isRow(result[0]) ? result[0] : isRow(data) ? data : null;
      }

      const orgId = await resolveOrgId(base, model, row, actor);
      if (!orgId) return;

      await base.auditLog.create({
        data: {
          orgId,
          actorId: actor?.userId ?? null,
          via: actor ? actor.via : "system",
          action,
          entityType: model,
          entityId: count === null && typeof row?.id === "string" ? row.id : null,
          entityLabel: count === null ? labelOf(row) : null,
          count,
          changes: changes as object | undefined ?? undefined,
          ipAddress: actor?.ipAddress ?? null,
          userAgent: actor?.userAgent ?? null,
        },
      });

      // Access changes and billing/payment detail changes also alert the org.
      const { alertOnSecurityEvent } = await import("@/lib/services/security-alerts");
      await alertOnSecurityEvent({
        orgId,
        actorId: actor?.userId ?? null,
        model,
        action,
        row: row ?? before,
        changes: (changes ?? null) as Record<string, unknown> | null,
        count,
      });
      const { alertOnBillingChange } = await import("@/lib/services/billing-change-alerts");
      await alertOnBillingChange({
        orgId,
        actorId: actor?.userId ?? null,
        model,
        action,
        row,
        before,
        changes: (changes ?? null) as Record<string, unknown> | null,
        count,
      });
    });
  } catch (err) {
    console.error(`[audit] failed to record ${model}.${operation}`, err);
  }
  return result;
}

/** For events that aren't a single row write (sign-ins, exports). */
export async function recordAuditEvent(
  base: PrismaClient,
  event: {
    orgIds: string[];
    actorId: string | null;
    action: string;
    entityType: string;
    entityId?: string | null;
    entityLabel?: string | null;
    /** Overrides the request's channel, e.g. "share" for a client contact
     * on a share page (who isn't a user). */
    via?: string;
  }
) {
  try {
    await inAudit.run(true, async () => {
      const actor = await resolveActor(base);
      await base.auditLog.createMany({
        data: event.orgIds.map((orgId) => ({
          orgId,
          actorId: event.actorId,
          via: event.via ?? actor?.via ?? "web",
          action: event.action,
          entityType: event.entityType,
          entityId: event.entityId ?? null,
          entityLabel: event.entityLabel ?? null,
          ipAddress: actor?.ipAddress ?? null,
          userAgent: actor?.userAgent ?? null,
        })),
      });
    });
  } catch (err) {
    console.error(`[audit] failed to record ${event.action}`, err);
  }
}
