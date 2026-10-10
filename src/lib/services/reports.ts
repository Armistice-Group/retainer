import "server-only";
import { prisma } from "@/lib/prisma";
import { daysOverdue } from "@/lib/invoice-aging";
import { balanceDue } from "@/lib/invoice-balance";

const DAY_MS = 86_400_000;

/** Weekdays in [from, to) × 8h — a simple capacity for utilization. */
export function capacityHours(from: Date, to: Date) {
  let days = 0;
  for (let t = from.getTime(); t < to.getTime(); t += DAY_MS) {
    const d = new Date(t).getUTCDay();
    if (d !== 0 && d !== 6) days++;
  }
  return days * 8;
}

export type PersonRow = {
  userId: string;
  name: string;
  hours: number;
  billableHours: number;
  billableValue: number;
  cost: number | null;
  /** Billable hours ÷ capacity. */
  utilization: number;
};

export type ProjectRow = {
  projectId: string;
  project: string;
  client: string;
  hours: number;
  billableValue: number;
  invoiced: number;
  laborCost: number;
  expenses: number;
  profit: number;
  margin: number | null;
  /** Some hours were logged by people with no cost rate set. */
  missingCost: boolean;
};

export type UnbilledRow = {
  clientId: string;
  client: string;
  hours: number;
  timeValue: number;
  milestones: number;
  expenses: number;
  total: number;
};

export type AgingRow = {
  clientId: string;
  client: string;
  current: number;
  d1to30: number;
  d31to60: number;
  d61to90: number;
  over90: number;
  total: number;
};

/** Everything on the Reports page for [from, to) — dates are UTC midnights
 * (time entry and invoice dates are stored that way). Unbilled work and
 * receivables are as of now, not limited to the range. */
export async function buildReport(orgId: string, from: Date, to: Date) {
  const [entries, rates, memberships, lineItems, expenses] = await Promise.all([
    prisma.timeEntry.findMany({
      where: { orgId, date: { gte: from, lt: to } },
      select: {
        hours: true,
        billable: true,
        rateOverride: true,
        userId: true,
        projectId: true,
        user: { select: { name: true } },
        project: { select: { name: true, client: { select: { name: true } } } },
      },
    }),
    prisma.projectMember.findMany({
      where: { project: { orgId } },
      select: { projectId: true, userId: true, billRate: true },
    }),
    prisma.membership.findMany({
      where: { orgId },
      select: { userId: true, costRate: true, user: { select: { name: true } } },
    }),
    prisma.invoiceLineItem.findMany({
      where: {
        projectId: { not: null },
        // Deposits aren't work invoiced: the invoice for the work is.
        invoice: { orgId, kind: "STANDARD", status: { in: ["SENT", "PAID"] }, issueDate: { gte: from, lt: to } },
      },
      select: { projectId: true, amount: true },
    }),
    prisma.expense.findMany({
      where: { orgId, status: "APPROVED", incurredAt: { gte: from, lt: to } },
      select: {
        projectId: true,
        amount: true,
        project: { select: { name: true, client: { select: { name: true } } } },
      },
    }),
  ]);

  const billRate = new Map(rates.map((r) => [`${r.projectId}:${r.userId}`, Number(r.billRate)]));
  const costRate = new Map(
    memberships.map((m) => [m.userId, m.costRate === null ? null : Number(m.costRate)])
  );
  const capacity = capacityHours(from, to);

  const people = new Map<string, PersonRow>();
  for (const m of memberships) {
    people.set(m.userId, {
      userId: m.userId,
      name: m.user.name,
      hours: 0,
      billableHours: 0,
      billableValue: 0,
      cost: costRate.get(m.userId) === null ? null : 0,
      utilization: 0,
    });
  }
  const projects = new Map<string, ProjectRow>();
  const projectRow = (id: string, name: string, client: string) => {
    let row = projects.get(id);
    if (!row) {
      row = {
        projectId: id,
        project: name,
        client,
        hours: 0,
        billableValue: 0,
        invoiced: 0,
        laborCost: 0,
        expenses: 0,
        profit: 0,
        margin: null,
        missingCost: false,
      };
      projects.set(id, row);
    }
    return row;
  };

  for (const e of entries) {
    const hours = Number(e.hours);
    const rate =
      e.rateOverride !== null
        ? Number(e.rateOverride)
        : (billRate.get(`${e.projectId}:${e.userId}`) ?? 0);
    const value = e.billable ? hours * rate : 0;
    const cost = costRate.get(e.userId);

    // Former members still count for the time they logged.
    let person = people.get(e.userId);
    if (!person) {
      person = {
        userId: e.userId,
        name: e.user.name,
        hours: 0,
        billableHours: 0,
        billableValue: 0,
        cost: null,
        utilization: 0,
      };
      people.set(e.userId, person);
    }
    person.hours += hours;
    if (e.billable) person.billableHours += hours;
    person.billableValue += value;
    if (person.cost !== null && cost != null) person.cost += hours * cost;

    const p = projectRow(e.projectId, e.project.name, e.project.client.name);
    p.hours += hours;
    p.billableValue += value;
    if (cost == null) p.missingCost = true;
    else p.laborCost += hours * cost;
  }
  for (const li of lineItems) {
    const p = projects.get(li.projectId!);
    if (p) p.invoiced += Number(li.amount);
    else {
      const project = await prisma.project.findUnique({
        where: { id: li.projectId! },
        select: { name: true, client: { select: { name: true } } },
      });
      if (project) projectRow(li.projectId!, project.name, project.client.name).invoiced += Number(li.amount);
    }
  }
  for (const ex of expenses) {
    projectRow(ex.projectId, ex.project.name, ex.project.client.name).expenses += Number(ex.amount);
  }
  for (const p of projects.values()) {
    p.profit = p.invoiced - p.laborCost - p.expenses;
    p.margin = p.invoiced > 0 ? p.profit / p.invoiced : null;
  }
  for (const person of people.values()) {
    person.utilization = capacity > 0 ? person.billableHours / capacity : 0;
  }

  return {
    from,
    to,
    capacity,
    people: [...people.values()]
      .filter((p) => p.hours > 0 || p.cost !== null)
      .sort((a, b) => b.hours - a.hours),
    projects: [...projects.values()].sort((a, b) => b.invoiced - a.invoiced || b.hours - a.hours),
    unbilled: await unbilledByClient(orgId, billRate),
    aging: await agingByClient(orgId),
    received: await receivedInRange(orgId, from, to),
  };
}

/** Cash received in [from, to): payments by the date they arrived, in the
 * org's default currency (other currencies are listed separately). Applied
 * credit isn't cash, so it isn't counted. */
async function receivedInRange(orgId: string, from: Date, to: Date) {
  const rows = await prisma.payment.groupBy({
    by: ["currency"],
    where: { orgId, receivedAt: { gte: from, lt: to } },
    _sum: { amount: true },
    _count: true,
  });
  return rows
    .map((r) => ({ currency: r.currency, amount: Number(r._sum.amount ?? 0), count: r._count }))
    .sort((a, b) => b.amount - a.amount);
}

async function unbilledByClient(orgId: string, billRate: Map<string, number>) {
  const [entries, milestones, expenses] = await Promise.all([
    prisma.timeEntry.findMany({
      where: { orgId, billable: true, invoiceLineItemId: null },
      select: {
        hours: true,
        rateOverride: true,
        userId: true,
        projectId: true,
        project: { select: { client: { select: { id: true, name: true } } } },
      },
    }),
    prisma.milestone.findMany({
      where: { project: { orgId }, completedAt: { not: null }, invoiceLineItemId: null },
      select: { amount: true, project: { select: { client: { select: { id: true, name: true } } } } },
    }),
    prisma.expense.findMany({
      where: { orgId, status: "APPROVED", invoiceLineItemId: null },
      select: { amount: true, project: { select: { client: { select: { id: true, name: true } } } } },
    }),
  ]);
  const rows = new Map<string, UnbilledRow>();
  const row = (c: { id: string; name: string }) => {
    let r = rows.get(c.id);
    if (!r) {
      r = { clientId: c.id, client: c.name, hours: 0, timeValue: 0, milestones: 0, expenses: 0, total: 0 };
      rows.set(c.id, r);
    }
    return r;
  };
  for (const e of entries) {
    const r = row(e.project.client);
    const hours = Number(e.hours);
    const rate =
      e.rateOverride !== null
        ? Number(e.rateOverride)
        : (billRate.get(`${e.projectId}:${e.userId}`) ?? 0);
    r.hours += hours;
    r.timeValue += hours * rate;
  }
  for (const m of milestones) row(m.project.client).milestones += Number(m.amount);
  for (const x of expenses) row(x.project.client).expenses += Number(x.amount);
  for (const r of rows.values()) r.total = r.timeValue + r.milestones + r.expenses;
  return [...rows.values()].filter((r) => r.total > 0).sort((a, b) => b.total - a.total);
}

async function agingByClient(orgId: string) {
  const invoices = await prisma.invoice.findMany({
    where: { orgId, status: "SENT" },
    select: {
      total: true,
      amountPaid: true,
      creditApplied: true,
      dueDate: true,
      client: { select: { id: true, name: true } },
    },
  });
  const rows = new Map<string, AgingRow>();
  for (const inv of invoices) {
    let r = rows.get(inv.client.id);
    if (!r) {
      r = {
        clientId: inv.client.id,
        client: inv.client.name,
        current: 0,
        d1to30: 0,
        d31to60: 0,
        d61to90: 0,
        over90: 0,
        total: 0,
      };
      rows.set(inv.client.id, r);
    }
    // What's still owed, not the original total.
    const amount = balanceDue(inv);
    if (amount <= 0) continue;
    const late = daysOverdue(inv.dueDate);
    if (late === 0) r.current += amount;
    else if (late <= 30) r.d1to30 += amount;
    else if (late <= 60) r.d31to60 += amount;
    else if (late <= 90) r.d61to90 += amount;
    else r.over90 += amount;
    r.total += amount;
  }
  return [...rows.values()].filter((r) => r.total > 0).sort((a, b) => b.total - a.total);
}

export type Report = Awaited<ReturnType<typeof buildReport>>;

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** The range a Reports URL asks for: from/to (yyyy-mm-dd, inclusive) when
 * given, else a named preset, as [from, to) UTC dates. */
export function reportRangeFromParams(params: { range?: string; from?: string; to?: string }) {
  if (params.from && params.to && ISO.test(params.from) && ISO.test(params.to)) {
    const from = new Date(`${params.from}T00:00:00Z`);
    const to = new Date(new Date(`${params.to}T00:00:00Z`).getTime() + DAY_MS);
    if (to > from) return { preset: "custom", from, to };
  }
  return reportRange(params.range);
}

/** Named ranges for the Reports page, as [from, to) UTC dates. */
export function reportRange(preset: string | undefined, now = new Date()) {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const utc = (yy: number, mm: number, dd = 1) => new Date(Date.UTC(yy, mm, dd));
  const tomorrow = utc(y, m, now.getUTCDate() + 1);
  switch (preset) {
    case "last-month":
      return { preset, from: utc(y, m - 1), to: utc(y, m) };
    case "quarter":
      return { preset, from: utc(y, m - (m % 3)), to: tomorrow };
    case "ytd":
      return { preset, from: utc(y, 0), to: tomorrow };
    case "12m":
      return { preset, from: utc(y, m - 11), to: tomorrow };
    default:
      return { preset: "month", from: utc(y, m), to: tomorrow };
  }
}
