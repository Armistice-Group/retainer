import { prisma } from "@/lib/prisma";
import { requireOrgContext } from "@/lib/org-context";
import { recordAuditEvent } from "@/lib/audit";
import { describeAudit, findAuditEntries, parseAuditFilters } from "@/lib/audit-query";

// Exports are capped so one request can't pull an unbounded table; narrow
// the date range for more.
const MAX_ROWS = 50_000;

function csvCell(value: unknown) {
  const s = value === null || value === undefined ? "" : String(value);
  // Neutralise spreadsheet formulas as well as quoting.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export async function GET(req: Request) {
  const { org, role, user } = await requireOrgContext();
  if (role !== "OWNER" && role !== "ADMIN") {
    return new Response("Not found", { status: 404 });
  }

  const params = Object.fromEntries(new URL(req.url).searchParams);
  const filters = parseAuditFilters(params);
  const entries = await findAuditEntries(org.id, filters, { take: MAX_ROWS });
  await recordAuditEvent(prisma, {
    orgIds: [org.id],
    actorId: user.id ?? null,
    action: "export",
    entityType: "AuditLog",
    entityLabel: `${entries.length} entries`,
  });

  const header = [
    "time",
    "actor",
    "actor_email",
    "via",
    "action",
    "summary",
    "record_type",
    "record_id",
    "record",
    "count",
    "changes",
    "ip_address",
    "user_agent",
  ];
  const lines = [header.join(",")];
  for (const e of entries) {
    lines.push(
      [
        e.createdAt.toISOString(),
        e.actor?.name ?? (e.via === "system" ? "System" : ""),
        e.actor?.email ?? "",
        e.via,
        e.action,
        describeAudit(e),
        e.entityType,
        e.entityId,
        e.entityLabel,
        e.count,
        e.changes ? JSON.stringify(e.changes) : "",
        e.ipAddress,
        e.userAgent,
      ]
        .map(csvCell)
        .join(",")
    );
  }

  const date = new Date().toISOString().slice(0, 10);
  return new Response(lines.join("\n") + "\n", {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="audit-log-${org.slug}-${date}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
