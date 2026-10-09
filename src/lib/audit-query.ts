import "server-only";
import { prisma } from "@/lib/prisma";
import { AUDITED_MODELS } from "@/lib/audit";
import type { Prisma } from "@/generated/prisma/client";

export const AUDIT_PAGE_SIZE = 50;

export const AUDIT_ENTITY_TYPES = [...AUDITED_MODELS].sort();

export type AuditFilters = {
  actor: string; // user id, "system", or "" for everyone
  type: string; // entity type or ""
  action: string; // create | update | delete | sign_in | ""
  from: string; // yyyy-mm-dd
  to: string; // yyyy-mm-dd
};

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const ACTIONS = new Set(["create", "update", "delete", "sign_in", "view", "download", "export"]);

export function parseAuditFilters(params: Record<string, string | undefined>): AuditFilters {
  return {
    actor: params.actor ?? "",
    type: params.type && AUDIT_ENTITY_TYPES.includes(params.type as never) ? params.type : "",
    action: params.action && ACTIONS.has(params.action) ? params.action : "",
    from: params.from && DATE.test(params.from) ? params.from : "",
    to: params.to && DATE.test(params.to) ? params.to : "",
  };
}

export function auditWhere(orgId: string, f: AuditFilters): Prisma.AuditLogWhereInput {
  const createdAt: Prisma.DateTimeFilter = {};
  if (f.from) createdAt.gte = new Date(`${f.from}T00:00:00Z`);
  if (f.to) createdAt.lt = new Date(new Date(`${f.to}T00:00:00Z`).getTime() + 86_400_000);
  return {
    orgId,
    ...(f.actor === "system" ? { actorId: null } : f.actor ? { actorId: f.actor } : {}),
    ...(f.type ? { entityType: f.type } : {}),
    ...(f.action ? { action: f.action } : {}),
    ...(f.from || f.to ? { createdAt } : {}),
  };
}

export async function findAuditEntries(
  orgId: string,
  f: AuditFilters,
  opts: { skip?: number; take: number }
) {
  return prisma.auditLog.findMany({
    where: auditWhere(orgId, f),
    include: { actor: { select: { id: true, name: true, email: true } } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: opts.skip,
    take: opts.take,
  });
}

/** "TimeEntry" → "time entry" */
export function humanizeType(type: string) {
  return type.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
}

/** "estimatedHours" → "estimated hours"; drops a trailing "Id". */
export function humanizeField(field: string) {
  return humanizeType(field.replace(/Id$/, ""));
}

const VERBS: Record<string, string> = {
  create: "created",
  update: "updated",
  delete: "deleted",
  sign_in: "signed in",
  export: "exported",
  view: "viewed",
  download: "downloaded",
};

export function describeAudit(entry: {
  action: string;
  entityType: string;
  entityLabel: string | null;
  count: number | null;
}) {
  if (entry.action === "sign_in") return "signed in";
  if (entry.action === "export") return "exported the audit log";
  const verb = VERBS[entry.action] ?? entry.action;
  if (entry.count !== null) {
    return `${verb} ${entry.count} ${humanizeType(entry.entityType)}${entry.count === 1 ? "" : "s"}`;
  }
  return `${verb} ${humanizeType(entry.entityType)}`;
}

/** Turns stored changes into "field: from → to" lines, swapping member ids
 * for names. */
export function formatAuditChanges(
  changes: unknown,
  names: Map<string, string>
): { field: string; from?: string; to: string }[] {
  if (!changes || typeof changes !== "object" || Array.isArray(changes)) return [];
  const show = (v: unknown): string => {
    if (v === null || v === undefined || v === "") return "—";
    if (typeof v === "string") return names.get(v) ?? v;
    return typeof v === "object" ? JSON.stringify(v) : String(v);
  };
  return Object.entries(changes as Record<string, unknown>).map(([field, value]) => {
    if (value && typeof value === "object" && !Array.isArray(value) && "to" in value) {
      const { from, to } = value as { from: unknown; to: unknown };
      return { field: humanizeField(field), from: show(from), to: show(to) };
    }
    return { field: humanizeField(field), to: show(value) };
  });
}

/** In-app page for an entity, when it still exists and has one. */
export function auditEntityHref(entry: {
  action: string;
  entityType: string;
  entityId: string | null;
}) {
  if (!entry.entityId || entry.action === "delete") return null;
  switch (entry.entityType) {
    case "Task":
      return `/tasks?task=${entry.entityId}`;
    case "Project":
      return `/projects/${entry.entityId}`;
    case "Client":
      return `/clients/${entry.entityId}`;
    case "Invoice":
      return `/invoices/${entry.entityId}`;
    case "TimeEntry":
      return "/time";
    case "Membership":
    case "Invite":
      return "/settings/members";
    default:
      return null;
  }
}
