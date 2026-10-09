import { authenticateApiRequest, forbidden, unauthorized } from "@/lib/api-auth";
import { describeAudit, findAuditEntries, parseAuditFilters } from "@/lib/audit-query";

// GET /api/v1/audit-log — owner/admin keys only. Filters: actor (user id or
// "system"), type, action, from, to (yyyy-mm-dd); paging: limit (≤200), page.
export async function GET(req: Request) {
  const ctx = await authenticateApiRequest(req);
  if (!ctx) return unauthorized();
  if (ctx.role !== "OWNER" && ctx.role !== "ADMIN") {
    return forbidden("Only owners and admins can read the audit log.");
  }
  const params = Object.fromEntries(new URL(req.url).searchParams);
  const limit = Math.min(200, Math.max(1, Number.parseInt(params.limit ?? "50", 10) || 50));
  const page = Math.max(0, Number.parseInt(params.page ?? "0", 10) || 0);
  const rows = await findAuditEntries(ctx.orgId, parseAuditFilters(params), {
    skip: page * limit,
    take: limit + 1,
  });
  return Response.json({
    entries: rows.slice(0, limit).map(serializeAuditEntry),
    nextPage: rows.length > limit ? page + 1 : null,
  });
}

function serializeAuditEntry(e: Awaited<ReturnType<typeof findAuditEntries>>[number]) {
  return {
    id: e.id,
    at: e.createdAt.toISOString(),
    actor: e.actor ? { id: e.actor.id, name: e.actor.name, email: e.actor.email } : null,
    via: e.via,
    action: e.action,
    summary: describeAudit(e),
    entityType: e.entityType,
    entityId: e.entityId,
    entityLabel: e.entityLabel,
    count: e.count,
    changes: e.changes,
    ipAddress: e.ipAddress,
    userAgent: e.userAgent,
  };
}
