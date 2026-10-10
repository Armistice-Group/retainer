import "server-only";
import { prisma } from "@/lib/prisma";
import { invoiceVisibilityWhere, projectVisibilityWhere } from "@/lib/project-access";
import type { Prisma, Role } from "@/generated/prisma/client";

// Everything with a date that one person may see, for the /calendar page,
// the dashboard's Upcoming card and the calendar subscription feed:
//   - their own meetings (from their calendar feeds — never anyone else's)
//   - task due dates (theirs, or everyone's on projects they can see)
//   - milestone / deliverable due dates, project start and end dates
//   - owners and admins only: unpaid invoice due dates, scheduled invoice
//     sends, recurring invoice runs, billing cycle closes, estimate expiries
// Project visibility (confidential projects) applies to every one of them.

export const CALENDAR_TYPES = [
  "meeting",
  "task",
  "milestone",
  "project",
  "invoice",
  "scheduled_send",
  "recurring",
  "billing_cycle",
  "estimate",
] as const;
export type CalendarType = (typeof CALENDAR_TYPES)[number];

/** Types only owners and admins see. */
export const BILLING_TYPES: CalendarType[] = [
  "invoice",
  "scheduled_send",
  "recurring",
  "billing_cycle",
  "estimate",
];

export const CALENDAR_TYPE_LABELS: Record<CalendarType, string> = {
  meeting: "Meetings",
  task: "Tasks",
  milestone: "Milestones & deliverables",
  project: "Project dates",
  invoice: "Invoices due",
  scheduled_send: "Scheduled sends",
  recurring: "Recurring invoices",
  billing_cycle: "Billing cycles",
  estimate: "Estimate expiries",
};

export type CalendarItem = {
  /** Stable across reads, e.g. "task:abc" (also the iCal UID). */
  key: string;
  type: CalendarType;
  /** YYYY-MM-DD the item falls on (in the viewer's time zone for timed items). */
  day: string;
  /** ISO start/end, for timed items (meetings, scheduled sends). */
  start?: string;
  end?: string;
  title: string;
  /** Client — project, or similar. */
  detail: string | null;
  href: string;
  clientId: string | null;
  projectId: string | null;
  /** Finished: task done, milestone complete, meeting ignored. */
  done: boolean;
  /** Past its date and not done. */
  overdue: boolean;
  /** Meetings: PENDING (to sort), LOGGED or IGNORED. */
  meetingStatus?: "PENDING" | "LOGGED" | "IGNORED";
  /** Milestones: false = a deliverable. */
  billable?: boolean;
};

export type CalendarViewer = { orgId: string; userId: string; role: Role };

export type CalendarQuery = {
  /** First day, YYYY-MM-DD (inclusive). */
  from: string;
  /** Last day, YYYY-MM-DD (inclusive). */
  to: string;
  types?: CalendarType[];
  clientId?: string | null;
  projectId?: string | null;
  /** Tasks: only the viewer's (default) or everyone's they can see. */
  tasks?: "mine" | "all";
  /** IANA zone for placing timed items on a day. Defaults to UTC. */
  timeZone?: string;
  /** Leave out finished things (done tasks, completed milestones, meetings). */
  openOnly?: boolean;
};

const DAY_MS = 86_400_000;

export function isValidTimeZone(tz: string | null | undefined): tz is string {
  if (!tz) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** YYYY-MM-DD of an instant in a time zone. */
export function dayIn(date: Date, timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

const utcDay = (d: Date) => d.toISOString().slice(0, 10);
const dayDate = (day: string) => new Date(`${day}T00:00:00Z`);

export async function getCalendarItems(viewer: CalendarViewer, q: CalendarQuery): Promise<CalendarItem[]> {
  const canManage = viewer.role === "OWNER" || viewer.role === "ADMIN";
  const tz = isValidTimeZone(q.timeZone) ? q.timeZone : "UTC";
  const want = new Set<CalendarType>(
    (q.types?.length ? q.types : CALENDAR_TYPES).filter((t) => canManage || !BILLING_TYPES.includes(t))
  );
  const from = dayDate(q.from);
  const to = dayDate(q.to); // inclusive, date-only
  const toExclusive = new Date(to.getTime() + DAY_MS);
  // Timed items: a day either side, then placed by local day.
  const wideFrom = new Date(from.getTime() - DAY_MS);
  const wideTo = new Date(toExclusive.getTime() + DAY_MS);
  const inRange = (day: string) => day >= q.from && day <= q.to;
  const today = utcDay(new Date());

  // Projects this person can see (and that aren't archived): the visibility
  // set every project-bound item is checked against.
  const projects = await prisma.project.findMany({
    where: {
      orgId: viewer.orgId,
      status: { not: "ARCHIVED" },
      ...projectVisibilityWhere(viewer.userId, viewer.role),
      ...(q.clientId ? { clientId: q.clientId } : {}),
      ...(q.projectId ? { id: q.projectId } : {}),
    },
    select: {
      id: true,
      name: true,
      startDate: true,
      endDate: true,
      clientId: true,
      client: { select: { name: true } },
    },
  });
  const projectById = new Map(projects.map((p) => [p.id, p]));
  const projectIds = [...projectById.keys()];
  const label = (projectId: string) => {
    const p = projectById.get(projectId)!;
    return `${p.client.name} — ${p.name}`;
  };

  const items: CalendarItem[] = [];
  const jobs: Promise<void>[] = [];

  if (want.has("meeting") && !q.openOnly) {
    jobs.push(
      (async () => {
        const meetings = await prisma.calendarEvent.findMany({
          where: {
            // Only the viewer's own meetings, from their feeds in this org.
            userId: viewer.userId,
            feed: { orgId: viewer.orgId },
            start: { gte: wideFrom, lt: wideTo },
            ...(q.clientId || q.projectId ? { projectId: { in: projectIds } } : {}),
          },
          select: { id: true, title: true, start: true, end: true, status: true, projectId: true },
          orderBy: { start: "asc" },
          take: 1000,
        });
        for (const m of meetings) {
          const day = dayIn(m.start, tz);
          if (!inRange(day)) continue;
          // Only name a project the viewer can still see.
          const project = m.projectId ? projectById.get(m.projectId) : undefined;
          items.push({
            key: `meeting:${m.id}`,
            type: "meeting",
            day,
            start: m.start.toISOString(),
            end: m.end.toISOString(),
            title: m.title,
            detail: project ? label(project.id) : m.status === "PENDING" ? "To sort" : null,
            href: m.status === "PENDING" ? "/time?view=meetings" : "/time",
            clientId: project?.clientId ?? null,
            projectId: project?.id ?? null,
            done: m.status === "IGNORED",
            overdue: false,
            meetingStatus: m.status,
          });
        }
      })()
    );
  }

  if (want.has("task") && projectIds.length) {
    jobs.push(
      (async () => {
        const tasks = await prisma.task.findMany({
          where: {
            projectId: { in: projectIds },
            dueDate: { gte: from, lte: to },
            ...(q.tasks === "all" ? {} : { assigneeId: viewer.userId }),
            ...(q.openOnly ? { status: { not: "DONE" as const } } : {}),
          },
          select: {
            id: true,
            title: true,
            dueDate: true,
            status: true,
            projectId: true,
            assignee: { select: { name: true } },
          },
          take: 2000,
        });
        for (const t of tasks) {
          const day = utcDay(t.dueDate!);
          const done = t.status === "DONE";
          const p = projectById.get(t.projectId)!;
          items.push({
            key: `task:${t.id}`,
            type: "task",
            day,
            title: t.title,
            detail:
              label(t.projectId) +
              (q.tasks === "all" ? ` · ${t.assignee?.name ?? "Unassigned"}` : ""),
            href: `/projects/${t.projectId}?task=${t.id}`,
            clientId: p.clientId,
            projectId: t.projectId,
            done,
            overdue: !done && day < today,
          });
        }
      })()
    );
  }

  if (want.has("milestone") && projectIds.length) {
    jobs.push(
      (async () => {
        const milestones = await prisma.milestone.findMany({
          where: {
            projectId: { in: projectIds },
            dueDate: { gte: from, lte: to },
            ...(q.openOnly ? { completedAt: null } : {}),
          },
          select: { id: true, name: true, dueDate: true, completedAt: true, billable: true, projectId: true },
          take: 2000,
        });
        for (const m of milestones) {
          const day = utcDay(m.dueDate!);
          const p = projectById.get(m.projectId)!;
          items.push({
            key: `milestone:${m.id}`,
            type: "milestone",
            day,
            title: `${m.billable ? "Milestone" : "Deliverable"}: ${m.name}`,
            detail: label(m.projectId),
            href: `/projects/${m.projectId}`,
            clientId: p.clientId,
            projectId: m.projectId,
            done: !!m.completedAt,
            overdue: !m.completedAt && day < today,
            billable: m.billable,
          });
        }
      })()
    );
  }

  if (want.has("project") && !q.openOnly) {
    for (const p of projects) {
      for (const [edge, date] of [
        ["starts", p.startDate],
        ["ends", p.endDate],
      ] as const) {
        if (!date) continue;
        const day = utcDay(date);
        if (!inRange(day)) continue;
        items.push({
          key: `project-${edge === "starts" ? "start" : "end"}:${p.id}`,
          type: "project",
          day,
          title: `${p.name} ${edge}`,
          detail: p.client.name,
          href: `/projects/${p.id}`,
          clientId: p.clientId,
          projectId: p.id,
          done: false,
          overdue: false,
        });
      }
    }
  }

  if (canManage) {
    // An invoice "belongs" to a project filter when it has a line on it.
    const invoiceScope: Prisma.InvoiceWhereInput = {
      orgId: viewer.orgId,
      ...invoiceVisibilityWhere(viewer.userId, viewer.role),
      ...(q.clientId ? { clientId: q.clientId } : {}),
      ...(q.projectId ? { lineItems: { some: { projectId: q.projectId } } } : {}),
    };

    if (want.has("invoice")) {
      jobs.push(
        (async () => {
          const invoices = await prisma.invoice.findMany({
            where: { ...invoiceScope, status: "SENT", dueDate: { gte: from, lte: to } },
            select: { id: true, number: true, dueDate: true, clientId: true, client: { select: { name: true } } },
            take: 2000,
          });
          for (const inv of invoices) {
            const day = utcDay(inv.dueDate);
            items.push({
              key: `invoice-due:${inv.id}`,
              type: "invoice",
              day,
              title: `Invoice ${inv.number} due`,
              detail: inv.client.name,
              href: `/invoices/${inv.id}`,
              clientId: inv.clientId,
              projectId: null,
              done: false,
              overdue: day < today,
            });
          }
        })()
      );
    }

    if (want.has("scheduled_send")) {
      jobs.push(
        (async () => {
          const drafts = await prisma.invoice.findMany({
            where: { ...invoiceScope, status: "DRAFT", scheduledSendAt: { gte: wideFrom, lt: wideTo } },
            select: {
              id: true,
              number: true,
              scheduledSendAt: true,
              scheduledSendError: true,
              clientId: true,
              client: { select: { name: true } },
            },
            take: 1000,
          });
          for (const inv of drafts) {
            const day = dayIn(inv.scheduledSendAt!, tz);
            if (!inRange(day)) continue;
            items.push({
              key: `invoice-send:${inv.id}`,
              type: "scheduled_send",
              day,
              start: inv.scheduledSendAt!.toISOString(),
              title: inv.scheduledSendError ? `Invoice ${inv.number}: send failed` : `Send invoice ${inv.number}`,
              detail: inv.client.name,
              href: `/invoices/${inv.id}`,
              clientId: inv.clientId,
              projectId: null,
              done: false,
              overdue: !!inv.scheduledSendError,
            });
          }
        })()
      );
    }

    // Retainers and billing cycles are per client, not per project.
    if (want.has("recurring") && !q.projectId) {
      jobs.push(
        (async () => {
          const schedules = await prisma.recurringInvoiceSchedule.findMany({
            where: {
              orgId: viewer.orgId,
              active: true,
              nextRunAt: { gte: from, lt: toExclusive },
              ...(q.clientId ? { clientId: q.clientId } : {}),
            },
            select: {
              id: true,
              description: true,
              nextRunAt: true,
              autoSend: true,
              clientId: true,
              client: { select: { name: true } },
            },
            take: 1000,
          });
          for (const s of schedules) {
            items.push({
              key: `recurring:${s.id}:${utcDay(s.nextRunAt)}`,
              type: "recurring",
              day: utcDay(s.nextRunAt),
              title: `${s.autoSend ? "Recurring invoice sends" : "Recurring invoice drafted"}: ${s.description}`,
              detail: s.client.name,
              href: `/clients/${s.clientId}`,
              clientId: s.clientId,
              projectId: null,
              done: false,
              overdue: false,
            });
          }
        })()
      );
    }

    if (want.has("billing_cycle") && !q.projectId) {
      jobs.push(
        (async () => {
          const cycles = await prisma.clientBillingCycle.findMany({
            where: {
              orgId: viewer.orgId,
              active: true,
              nextRunAt: { gte: from, lt: toExclusive },
              ...(q.clientId ? { clientId: q.clientId } : {}),
            },
            select: { id: true, nextRunAt: true, clientId: true, client: { select: { name: true } } },
            take: 1000,
          });
          for (const c of cycles) {
            items.push({
              key: `billing-cycle:${c.id}:${utcDay(c.nextRunAt)}`,
              type: "billing_cycle",
              day: utcDay(c.nextRunAt),
              title: `Billing cycle closes: ${c.client.name}`,
              detail: "Unbilled work is invoiced",
              href: `/clients/${c.clientId}`,
              clientId: c.clientId,
              projectId: null,
              done: false,
              overdue: false,
            });
          }
        })()
      );
    }

    if (want.has("estimate")) {
      jobs.push(
        (async () => {
          const estimates = await prisma.estimate.findMany({
            where: {
              orgId: viewer.orgId,
              status: { in: ["DRAFT", "SENT"] },
              expiresAt: { gte: from, lte: to },
              ...(q.clientId ? { clientId: q.clientId } : {}),
              ...(q.projectId ? { projectId: q.projectId } : {}),
            },
            select: {
              id: true,
              number: true,
              title: true,
              expiresAt: true,
              clientId: true,
              projectId: true,
              client: { select: { name: true } },
            },
            take: 1000,
          });
          for (const e of estimates) {
            items.push({
              key: `estimate:${e.id}`,
              type: "estimate",
              day: utcDay(e.expiresAt!),
              title: `Estimate ${e.number} expires`,
              detail: `${e.client.name} — ${e.title}`,
              href: `/estimates/${e.id}`,
              clientId: e.clientId,
              projectId: e.projectId,
              done: false,
              overdue: false,
            });
          }
        })()
      );
    }
  }

  await Promise.all(jobs);
  return items.sort(
    (a, b) =>
      a.day.localeCompare(b.day) ||
      (a.start ?? "").localeCompare(b.start ?? "") ||
      CALENDAR_TYPES.indexOf(a.type) - CALENDAR_TYPES.indexOf(b.type) ||
      a.title.localeCompare(b.title)
  );
}

/** The dashboard's "Upcoming": the next two weeks of open deadlines. */
export async function upcomingItems(viewer: CalendarViewer, timeZone?: string, limit = 8) {
  const now = new Date();
  const tz = isValidTimeZone(timeZone) ? timeZone : "UTC";
  const from = dayIn(now, tz);
  const to = utcDay(new Date(dayDate(from).getTime() + 13 * DAY_MS));
  const items = await getCalendarItems(viewer, {
    from,
    to,
    timeZone: tz,
    tasks: "mine",
    openOnly: true,
    types: CALENDAR_TYPES.filter((t) => t !== "meeting"),
  });
  return items.slice(0, limit);
}
