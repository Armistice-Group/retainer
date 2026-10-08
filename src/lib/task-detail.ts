import "server-only";
import { prisma } from "@/lib/prisma";
import { canViewProject } from "@/lib/project-access";
import { canPushCommentsToLinear } from "@/lib/services/linear-sync";
import type { Role } from "@/generated/prisma/client";

export type TaskDetail = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  assigneeId: string | null;
  estimatedHours: number | null;
  actualHours: number;
  project: { id: string; name: string; clientName: string };
  members: { id: string; name: string }[];
  linearKey: string | null;
  linearUrl: string | null;
  canPostToLinear: boolean;
  timeEntries: {
    id: string;
    userName: string;
    date: string;
    hours: number;
    description: string | null;
    billable: boolean;
  }[];
  comments: {
    id: string;
    body: string;
    authorName: string | null;
    createdAt: string;
    linearUrl: string | null;
    canDelete: boolean;
  }[];
};

/** Everything the task sheet shows, or null when the task doesn't exist in
 * this org or sits on a project the viewer can't see. */
export async function getTaskDetail(
  taskId: string,
  viewer: { orgId: string; userId: string; role: Role }
): Promise<TaskDetail | null> {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: {
      project: {
        include: {
          client: { select: { name: true } },
          members: { include: { user: { select: { id: true, name: true } } } },
        },
      },
      externalLink: true,
      timeEntries: {
        include: { user: { select: { name: true } } },
        orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      },
      comments: {
        include: { author: { select: { name: true } } },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!task || task.project.orgId !== viewer.orgId) return null;
  if (!(await canViewProject(task.project, viewer.userId, viewer.role))) return null;

  const canModerate = viewer.role === "OWNER" || viewer.role === "ADMIN";
  return {
    id: task.id,
    title: task.title,
    description: task.description,
    status: task.status,
    assigneeId: task.assigneeId,
    estimatedHours: task.estimatedHours ? Number(task.estimatedHours) : null,
    actualHours: task.timeEntries.reduce((sum, e) => sum + Number(e.hours), 0),
    project: { id: task.project.id, name: task.project.name, clientName: task.project.client.name },
    members: task.project.members.map((m) => ({ id: m.user.id, name: m.user.name })),
    linearKey: task.externalLink?.source === "linear" ? task.externalLink.externalKey : null,
    linearUrl: task.externalLink?.source === "linear" ? task.externalLink.externalUrl : null,
    canPostToLinear: await canPushCommentsToLinear(task.id),
    timeEntries: task.timeEntries.map((e) => ({
      id: e.id,
      userName: e.user.name,
      date: e.date.toISOString(),
      hours: Number(e.hours),
      description: e.description,
      billable: e.billable,
    })),
    comments: task.comments.map((c) => ({
      id: c.id,
      body: c.body,
      authorName: c.author?.name ?? null,
      createdAt: c.createdAt.toISOString(),
      linearUrl: c.externalUrl,
      canDelete: canModerate || c.authorId === viewer.userId,
    })),
  };
}
