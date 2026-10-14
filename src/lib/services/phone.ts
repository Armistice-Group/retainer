import { prisma } from "@/lib/prisma";
import { projectVisibilityWhere } from "@/lib/project-access";
import { attachmentSelect } from "@/lib/services/time-entry-attachments";
import { addDays, parseLocalDate, toISODate } from "@/lib/date";
import type { Role } from "@/generated/prisma/client";

type Viewer = { orgId: string; userId: string; role: Role; clockRoundingMinutes: number };

/** What the phone view's timer and Log time need: the running timer, the
 * active projects you can log to (most recently used first), their tasks,
 * and the team for owners and admins. */
export async function phoneTimeData(viewer: Viewer) {
  const { orgId, userId, role } = viewer;
  const canManageTeam = role === "OWNER" || role === "ADMIN";
  const since = addDays(parseLocalDate(toISODate(new Date())), -21);

  const [activeTimer, projects, tasks, recent, members] = await Promise.all([
    prisma.activeTimer.findUnique({ where: { userId }, include: { project: true, task: true } }),
    prisma.project.findMany({
      where: { orgId, status: "ACTIVE", ...projectVisibilityWhere(userId, role) },
      include: { client: true },
      orderBy: [{ client: { name: "asc" } }, { name: "asc" }],
    }),
    prisma.task.findMany({
      where: { status: { not: "DONE" }, project: { orgId, status: "ACTIVE", ...projectVisibilityWhere(userId, role) } },
      select: { id: true, title: true, projectId: true },
    }),
    prisma.timeEntry.findMany({
      where: { orgId, userId, date: { gte: since } },
      orderBy: { createdAt: "desc" },
      select: { projectId: true },
      take: 200,
    }),
    canManageTeam
      ? prisma.membership.findMany({ where: { orgId }, include: { user: true }, orderBy: { user: { name: "asc" } } })
      : Promise.resolve([]),
  ]);

  const projectOptions = projects.map((p) => ({
    id: p.id,
    name: p.name,
    clientName: p.client.name,
    requireClockTimes: p.client.requireClockTimes,
    invoiceTimeDetail: p.client.invoiceTimeDetail,
  }));
  const known = new Set(projectOptions.map((p) => p.id));
  // One tap to start: the projects you've logged to lately, newest first.
  const recentProjectIds = [...new Set(recent.map((r) => r.projectId))].filter((id) => known.has(id)).slice(0, 4);

  return {
    activeTimer: activeTimer
      ? {
          startedAt: activeTimer.startedAt.toISOString(),
          description: activeTimer.description,
          projectId: activeTimer.projectId,
          projectName: activeTimer.project.name,
          taskId: activeTimer.taskId,
          taskTitle: activeTimer.task?.title ?? null,
          billable: activeTimer.billable,
        }
      : null,
    projects: projectOptions,
    tasks,
    recentProjectIds,
    dialog: {
      projects: projectOptions,
      tasks,
      canManageTeam,
      teamMembers: members.map((m) => ({ id: m.userId, name: m.user.name })),
      currentUserId: userId,
      defaultProjectId: recentProjectIds[0],
      clockRounding: viewer.clockRoundingMinutes,
      defaultDate: toISODate(new Date()),
    },
  };
}

/** Your entries from `from` up to (not including) `to`, newest day first. */
export async function phoneEntries(viewer: Viewer, from: Date, to: Date) {
  return prisma.timeEntry.findMany({
    where: { orgId: viewer.orgId, userId: viewer.userId, date: { gte: from, lt: to } },
    include: {
      project: { include: { client: true } },
      task: { select: { title: true } },
      attachments: { select: attachmentSelect, orderBy: { createdAt: "asc" } },
    },
    orderBy: [{ date: "desc" }, { startMinute: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
  });
}
