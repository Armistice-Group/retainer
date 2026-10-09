import "server-only";
import { prisma } from "@/lib/prisma";
import { notify } from "@/lib/notifications";
import { sendAlert } from "@/lib/alerts";
import { formatWeekLabel } from "@/lib/date";
import type {
  Prisma,
  Role,
  TimesheetApprovalMode,
  TimesheetStatus,
} from "@/generated/prisma/client";

export class TimesheetError extends Error {}

export type TimesheetContext = { orgId: string; actorId: string; actorName: string | null; role: Role };

const DAY_MS = 86_400_000;
const isAdmin = (role: Role) => role === "OWNER" || role === "ADMIN";

/** Monday (UTC date) of the week a TimeEntry date falls in. Entry dates are
 * stored as UTC midnight of their calendar day. */
export function weekStartOf(date: Date) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  return new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * DAY_MS);
}

/** "yyyy-mm-dd" (any day) → that week's Monday as a UTC date. */
export function weekStartFromISO(iso: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) throw new TimesheetError("Use a yyyy-mm-dd date.");
  return weekStartOf(new Date(`${iso}T00:00:00Z`));
}

const weekRange = (weekStart: Date) => ({
  gte: weekStart,
  lt: new Date(weekStart.getTime() + 7 * DAY_MS),
});

function label(weekStart: Date) {
  // formatWeekLabel reads local dates; rebuild the Monday in local time.
  return formatWeekLabel(
    new Date(weekStart.getUTCFullYear(), weekStart.getUTCMonth(), weekStart.getUTCDate())
  );
}

/** Whether this mode makes a member with this role/type submit their weeks.
 * Owners and admins never need approval. */
export function modeCovers(
  mode: TimesheetApprovalMode,
  membership: { role: Role; employmentType: string }
) {
  if (isAdmin(membership.role) || mode === "OFF") return false;
  return mode === "EVERYONE" || membership.employmentType === "CONTRACTOR";
}

export async function approvalRequiredFor(orgId: string, userId: string) {
  const [org, membership] = await Promise.all([
    prisma.organization.findUnique({ where: { id: orgId }, select: { timesheetApproval: true } }),
    prisma.membership.findUnique({ where: { userId_orgId: { userId, orgId } } }),
  ]);
  return !!org && !!membership && modeCovers(org.timesheetApproval, membership);
}

/** Time entries that can go on an invoice under the org's approval mode:
 * approved ones, plus anyone's the mode doesn't cover. Spread into a
 * timeEntry `where`. */
export function invoiceableTimeWhere(
  orgId: string,
  mode: TimesheetApprovalMode
): Prisma.TimeEntryWhereInput {
  if (mode === "OFF") return {};
  const exempt: Prisma.MembershipWhereInput =
    mode === "EVERYONE"
      ? { orgId, role: { in: ["OWNER", "ADMIN"] } }
      : { orgId, OR: [{ role: { in: ["OWNER", "ADMIN"] } }, { employmentType: "EMPLOYEE" }] };
  return {
    OR: [{ approvedAt: { not: null } }, { user: { memberships: { some: exempt } } }],
  };
}

export async function getTimesheet(orgId: string, userId: string, weekStart: Date) {
  return prisma.timesheet.findUnique({
    where: { orgId_userId_weekStart: { orgId, userId, weekStart } },
    include: { reviewedBy: { select: { name: true } } },
  });
}

/** Members can't add, change or remove time in a week they've submitted or
 * that's been approved; admins can (time they add to an approved week counts
 * as approved). Returns approvedAt for a new entry in that week. */
export async function assertWeekEditable(
  ctx: { orgId: string; actorId: string; role: Role },
  userId: string,
  date: Date
): Promise<Date | null> {
  const sheet = await getTimesheet(ctx.orgId, userId, weekStartOf(date));
  if (!sheet || sheet.status === "REJECTED") return null;
  if (isAdmin(ctx.role)) return sheet.status === "APPROVED" ? new Date() : null;
  throw new TimesheetError(
    sheet.status === "APPROVED"
      ? "That week's timesheet has been approved, so its time is locked."
      : "That week's timesheet is waiting for approval. Recall it to make changes."
  );
}

export async function submitTimesheet(ctx: TimesheetContext, weekISO: string) {
  const weekStart = weekStartFromISO(weekISO);
  if (!(await approvalRequiredFor(ctx.orgId, ctx.actorId))) {
    throw new TimesheetError("Your time doesn't need approval here.");
  }
  const hours = await prisma.timeEntry.aggregate({
    where: { orgId: ctx.orgId, userId: ctx.actorId, date: weekRange(weekStart) },
    _sum: { hours: true },
  });
  const total = Number(hours._sum.hours ?? 0);
  if (total === 0) throw new TimesheetError("There's no time logged that week.");

  const existing = await getTimesheet(ctx.orgId, ctx.actorId, weekStart);
  if (existing && existing.status !== "REJECTED") {
    throw new TimesheetError("That week is already submitted.");
  }
  const sheet = await prisma.timesheet.upsert({
    where: { orgId_userId_weekStart: { orgId: ctx.orgId, userId: ctx.actorId, weekStart } },
    create: {
      orgId: ctx.orgId,
      userId: ctx.actorId,
      weekStart,
      status: "SUBMITTED",
      submittedAt: new Date(),
    },
    update: { status: "SUBMITTED", submittedAt: new Date(), reviewedAt: null, reviewedById: null },
  });

  await sendAlert({
    orgId: ctx.orgId,
    event: "TIMESHEET_SUBMITTED",
    message: `${ctx.actorName ?? "Someone"} submitted ${total.toFixed(2)}h for the week of ${label(weekStart)}.`,
    link: "/time?view=approvals",
    excludeUserId: ctx.actorId,
  });
  return sheet;
}

/** Takes a submitted (not yet reviewed) week back to draft. */
export async function recallTimesheet(ctx: TimesheetContext, weekISO: string) {
  const weekStart = weekStartFromISO(weekISO);
  const sheet = await getTimesheet(ctx.orgId, ctx.actorId, weekStart);
  if (!sheet || sheet.status !== "SUBMITTED") {
    throw new TimesheetError("Only a submitted week that hasn't been reviewed can be recalled.");
  }
  await prisma.timesheet.delete({ where: { id: sheet.id } });
}

/** Approves a submitted week (its time becomes invoiceable) or sends it back
 * with a note. An approved week can also be reopened by sending it back;
 * time from it that's already invoiced stays invoiced. */
export async function reviewTimesheet(
  ctx: TimesheetContext,
  timesheetId: string,
  decision: { approve: boolean; note?: string | null }
) {
  if (!isAdmin(ctx.role)) throw new TimesheetError("Only owners and admins can review timesheets.");
  const sheet = await prisma.timesheet.findUnique({ where: { id: timesheetId } });
  if (!sheet || sheet.orgId !== ctx.orgId) throw new TimesheetError("Timesheet not found.");
  if (decision.approve && sheet.status !== "SUBMITTED") {
    throw new TimesheetError("Only submitted weeks can be approved.");
  }
  if (!decision.approve && sheet.status === "REJECTED") {
    throw new TimesheetError("That week has already been sent back.");
  }
  if (!decision.approve && !decision.note?.trim()) {
    throw new TimesheetError("Say what needs changing.");
  }

  const status: TimesheetStatus = decision.approve ? "APPROVED" : "REJECTED";
  const now = new Date();
  const entries = { orgId: ctx.orgId, userId: sheet.userId, date: weekRange(sheet.weekStart) };
  await prisma.$transaction([
    prisma.timesheet.update({
      where: { id: sheet.id },
      data: { status, note: decision.note?.trim() || null, reviewedAt: now, reviewedById: ctx.actorId },
    }),
    decision.approve
      ? prisma.timeEntry.updateMany({ where: entries, data: { approvedAt: now } })
      : prisma.timeEntry.updateMany({
          where: { ...entries, invoiceLineItemId: null },
          data: { approvedAt: null },
        }),
  ]);

  await notify(prisma, {
    orgId: ctx.orgId,
    userIds: [sheet.userId],
    type: "TIMESHEET_REVIEWED",
    message: decision.approve
      ? `${ctx.actorName ?? "An admin"} approved your timesheet for the week of ${label(sheet.weekStart)}.`
      : `${ctx.actorName ?? "An admin"} sent back your timesheet for the week of ${label(sheet.weekStart)}: ${decision.note!.trim()}`,
    link: `/time?week=${sheet.weekStart.toISOString().slice(0, 10)}`,
  });
  return { id: sheet.id, status };
}

/** Submitted weeks waiting on review, oldest first, with their entries. */
export async function pendingTimesheets(orgId: string) {
  const sheets = await prisma.timesheet.findMany({
    where: { orgId, status: "SUBMITTED" },
    include: { user: { select: { id: true, name: true } } },
    orderBy: { submittedAt: "asc" },
  });
  return Promise.all(
    sheets.map(async (sheet) => {
      const entries = await prisma.timeEntry.findMany({
        where: { orgId, userId: sheet.userId, date: weekRange(sheet.weekStart) },
        include: { project: { include: { client: { select: { name: true } } } } },
        orderBy: { date: "asc" },
      });
      return {
        id: sheet.id,
        userId: sheet.user.id,
        userName: sheet.user.name,
        weekStart: sheet.weekStart.toISOString().slice(0, 10),
        weekLabel: label(sheet.weekStart),
        submittedAt: sheet.submittedAt,
        hours: entries.reduce((sum, e) => sum + Number(e.hours), 0),
        billableHours: entries.filter((e) => e.billable).reduce((s, e) => s + Number(e.hours), 0),
        entries: entries.map((e) => ({
          id: e.id,
          date: e.date.toISOString().slice(0, 10),
          hours: Number(e.hours),
          billable: e.billable,
          description: e.description,
          project: `${e.project.client.name} — ${e.project.name}`,
        })),
      };
    })
  );
}
