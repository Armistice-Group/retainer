import "server-only";
import { prisma } from "@/lib/prisma";
import { sendAlert } from "@/lib/alerts";
import { formatDate } from "@/lib/format";
import type { Role } from "@/generated/prisma/client";

// Deadline reminders, run once a day by the daily cron job
// (/api/cron/recurring-invoices):
//   - a task due tomorrow → its assignee (TASK_DUE_SOON)
//   - a task past its due date → its assignee (DEADLINE_OVERDUE)
//   - a milestone or deliverable past its due date and not complete → owners,
//     admins and the project's members (DEADLINE_OVERDUE)
// Each is sent once per due date: the row remembers it (dueSoonNotifiedAt /
// overdueNotifiedAt), and changing the due date clears that so the new date
// gets its own reminders. Only projects that are active or on hold.

const DAY_MS = 86_400_000;
const LIVE_PROJECT = { status: { in: ["ACTIVE" as const, "ON_HOLD" as const] } };

/** Today as a date-only value (UTC midnight), the way @db.Date columns come back. */
export function utcToday(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function sameDay(a: Date | null, b: Date | null) {
  if (!a || !b) return a === b;
  return a.toISOString().slice(0, 10) === b.toISOString().slice(0, 10);
}

/** Prisma data for a task's new due date: clears the reminders already sent
 * when the date actually changes. `next` undefined = leave it alone. */
export function dueDateData(current: Date | null, next: Date | null | undefined) {
  if (next === undefined) return {};
  if (sameDay(current, next)) return { dueDate: next };
  return { dueDate: next, dueSoonNotifiedAt: null, overdueNotifiedAt: null };
}

/** Same for a milestone (which only has the overdue reminder). */
export function milestoneDueDateData(current: Date | null, next: Date | null | undefined) {
  if (next === undefined) return {};
  if (sameDay(current, next)) return { dueDate: next };
  return { dueDate: next, overdueNotifiedAt: null };
}

/** Whether this user still belongs to the org and can see the project. */
async function canStillSee(
  orgId: string,
  userId: string,
  project: { id: string; confidential: boolean }
) {
  const membership = await prisma.membership.findUnique({
    where: { userId_orgId: { userId, orgId } },
    select: { role: true },
  });
  if (!membership) return false;
  const role: Role = membership.role;
  if (role === "OWNER" || role === "ADMIN" || !project.confidential) return true;
  return !!(await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId: project.id, userId } },
  }));
}

const taskInclude = {
  project: { select: { id: true, name: true, orgId: true, confidential: true } },
  assignee: { select: { id: true, name: true } },
} as const;

export async function sendDeadlineReminders(now = new Date()) {
  const today = utcToday(now);
  const tomorrow = new Date(today.getTime() + DAY_MS);
  let dueSoon = 0;
  let tasksOverdue = 0;
  let milestonesOverdue = 0;

  // ── Tasks due tomorrow ──────────────────────────────────────────────
  const soon = await prisma.task.findMany({
    where: {
      dueDate: tomorrow,
      status: { not: "DONE" },
      assigneeId: { not: null },
      dueSoonNotifiedAt: null,
      project: LIVE_PROJECT,
    },
    include: taskInclude,
  });
  for (const task of soon) {
    // Claim it first so an overlapping run can't send it twice.
    const { count } = await prisma.task.updateMany({
      where: { id: task.id, dueSoonNotifiedAt: null },
      data: { dueSoonNotifiedAt: now },
    });
    if (!count || !task.assignee) continue;
    if (!(await canStillSee(task.project.orgId, task.assignee.id, task.project))) continue;
    await sendAlert({
      orgId: task.project.orgId,
      event: "TASK_DUE_SOON",
      onlyTo: [task.assignee.id],
      message: `"${task.title}" on ${task.project.name} is due tomorrow (${formatDate(task.dueDate!)}).`,
      externalMessage: task.project.confidential
        ? `A task assigned to ${task.assignee.name} on a confidential project is due tomorrow.`
        : `"${task.title}" on ${task.project.name}, assigned to ${task.assignee.name}, is due tomorrow (${formatDate(task.dueDate!)}).`,
      link: `/projects/${task.project.id}?task=${task.id}`,
    });
    dueSoon++;
  }

  // ── Overdue tasks ───────────────────────────────────────────────────
  const lateTasks = await prisma.task.findMany({
    where: {
      dueDate: { lt: today },
      status: { not: "DONE" },
      assigneeId: { not: null },
      overdueNotifiedAt: null,
      project: LIVE_PROJECT,
    },
    include: taskInclude,
  });
  for (const task of lateTasks) {
    const { count } = await prisma.task.updateMany({
      where: { id: task.id, overdueNotifiedAt: null },
      data: { overdueNotifiedAt: now },
    });
    if (!count || !task.assignee) continue;
    if (!(await canStillSee(task.project.orgId, task.assignee.id, task.project))) continue;
    const due = formatDate(task.dueDate!);
    await sendAlert({
      orgId: task.project.orgId,
      event: "DEADLINE_OVERDUE",
      onlyTo: [task.assignee.id],
      message: `"${task.title}" on ${task.project.name} was due ${due} and isn't done.`,
      externalMessage: task.project.confidential
        ? `A task assigned to ${task.assignee.name} on a confidential project is overdue.`
        : `"${task.title}" on ${task.project.name}, assigned to ${task.assignee.name}, was due ${due} and isn't done.`,
      link: `/projects/${task.project.id}?task=${task.id}`,
    });
    tasksOverdue++;
  }

  // ── Overdue milestones and deliverables ─────────────────────────────
  const lateMilestones = await prisma.milestone.findMany({
    where: {
      dueDate: { lt: today },
      completedAt: null,
      overdueNotifiedAt: null,
      project: LIVE_PROJECT,
    },
    include: {
      project: {
        select: {
          id: true,
          name: true,
          orgId: true,
          confidential: true,
          client: { select: { name: true } },
          members: { select: { userId: true } },
        },
      },
    },
  });
  for (const m of lateMilestones) {
    const { count } = await prisma.milestone.updateMany({
      where: { id: m.id, overdueNotifiedAt: null },
      data: { overdueNotifiedAt: now },
    });
    if (!count) continue;
    const kind = m.billable ? "Milestone" : "Deliverable";
    await sendAlert({
      orgId: m.project.orgId,
      event: "DEADLINE_OVERDUE",
      message: `${kind} "${m.name}" on ${m.project.name} (${m.project.client.name}) was due ${formatDate(m.dueDate!)} and isn't marked complete.`,
      externalMessage: m.project.confidential
        ? `A ${kind.toLowerCase()} on a confidential project is overdue.`
        : undefined,
      link: `/projects/${m.project.id}`,
      // Project members can see the project (confidential or not).
      alsoNotify: m.project.members.map((pm) => pm.userId),
    });
    milestonesOverdue++;
  }

  return { dueSoon, tasksOverdue, milestonesOverdue };
}
