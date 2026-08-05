import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOrgContext } from "@/lib/org-context";
import { timeEntryWhere } from "@/lib/services/time-entries";
import { addDays, parseLocalDate, startOfWeek, toISODate } from "@/lib/date";

function csvEscape(value: string) {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export async function GET(req: Request) {
  const { org, user, role } = await requireOrgContext();
  const url = new URL(req.url);
  const week = url.searchParams.get("week");
  const teamView = url.searchParams.get("view") === "team";
  const filterUserId = url.searchParams.get("userId") ?? undefined;

  const weekStart = startOfWeek(week ? parseLocalDate(week) : new Date());
  const weekEnd = addDays(weekStart, 7);

  const entries = await prisma.timeEntry.findMany({
    where: timeEntryWhere({
      orgId: org.id,
      actorId: user.id,
      role,
      teamView,
      weekStart,
      weekEnd,
      filterUserId,
    }),
    include: { project: { include: { client: true } }, user: true },
    orderBy: [{ date: "asc" }, { project: { name: "asc" } }],
  });

  const header = [
    "Date",
    "Client",
    "Project",
    "User",
    "Hours",
    "Billable",
    "Rate Override",
    "Description",
    "Invoiced",
  ];
  const rows = entries.map((e) => [
    toISODate(new Date(e.date)),
    e.project.client.name,
    e.project.name,
    e.user.name,
    Number(e.hours).toFixed(2),
    e.billable ? "Yes" : "No",
    e.rateOverride != null ? Number(e.rateOverride).toFixed(2) : "",
    e.description ?? "",
    e.invoiceLineItemId ? "Yes" : "No",
  ]);

  const csv = [header, ...rows].map((row) => row.map(csvEscape).join(",")).join("\r\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="time-entries-${toISODate(weekStart)}.csv"`,
    },
  });
}
