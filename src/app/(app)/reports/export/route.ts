import { requireOrgContext } from "@/lib/org-context";
import { buildReport, reportRangeFromParams } from "@/lib/services/reports";

function csvCell(value: unknown) {
  const s = value === null || value === undefined ? "" : String(value);
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}
const n = (x: number | null) => (x === null ? "" : x.toFixed(2));

export async function GET(req: Request) {
  const { org, role } = await requireOrgContext();
  if (role !== "OWNER" && role !== "ADMIN") return new Response("Not found", { status: 404 });

  const params = Object.fromEntries(new URL(req.url).searchParams);
  const range = reportRangeFromParams(params);
  const report = await buildReport(org.id, range.from, range.to);

  let rows: unknown[][];
  switch (params.section) {
    case "people":
      rows = [
        ["person", "hours", "billable_hours", "utilization", "billable_value", "cost"],
        ...report.people.map((p) => [p.name, n(p.hours), n(p.billableHours), n(p.utilization), n(p.billableValue), n(p.cost)]),
      ];
      break;
    case "projects":
      rows = [
        ["client", "project", "hours", "billable_value", "invoiced", "labor_cost", "expenses", "profit", "margin", "missing_cost_rates"],
        ...report.projects.map((p) => [p.client, p.project, n(p.hours), n(p.billableValue), n(p.invoiced), n(p.laborCost), n(p.expenses), n(p.profit), n(p.margin), p.missingCost]),
      ];
      break;
    case "unbilled":
      rows = [
        ["client", "hours", "time_value", "milestones", "expenses", "total"],
        ...report.unbilled.map((u) => [u.client, n(u.hours), n(u.timeValue), n(u.milestones), n(u.expenses), n(u.total)]),
      ];
      break;
    case "aging":
      rows = [
        ["client", "current", "1_30", "31_60", "61_90", "over_90", "total"],
        ...report.aging.map((a) => [a.client, n(a.current), n(a.d1to30), n(a.d31to60), n(a.d61to90), n(a.over90), n(a.total)]),
      ];
      break;
    default:
      return new Response("Unknown section", { status: 400 });
  }

  const body = rows.map((r) => r.map(csvCell).join(",")).join("\n") + "\n";
  const from = range.from.toISOString().slice(0, 10);
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${params.section}-${from}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
