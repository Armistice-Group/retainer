import "server-only";
import { prisma } from "@/lib/prisma";
import { canViewProject } from "@/lib/project-access";
import { canPushCommentsToLinear } from "@/lib/services/linear-sync";
import { mentionableUsers } from "@/lib/services/task-followers";
import type { Role } from "@/generated/prisma/client";

export type TaskDetail = {
  id: string;
  viewerId: string;
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
  /** The project shows tasks on a live share link, so comments can be
   * shared with the client. */
  clientSharing: boolean;
  /** People who can be @mentioned here (everyone who can see the project). */
  mentionable: { id: string; name: string }[];
  /** The viewer follows this task's comments (assignees always do). */
  watching: boolean;
  /** The viewer's timer is running on this task. */
  timerRunning: boolean;
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
    /** Pulled in from the Linear issue rather than written here. */
    fromLinear: boolean;
    /** Shown on the project's share page. */
    sharedWithClient: boolean;
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
    viewerId: viewer.userId,
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
    mentionable: await mentionableUsers(task.project),
    clientSharing: task.project.shareTasks && !!task.project.shareToken,
    watching:
      task.assigneeId === viewer.userId ||
      !!(await prisma.taskWatcher.findUnique({
        where: { taskId_userId: { taskId: task.id, userId: viewer.userId } },
      })),
    timerRunning:
      (await prisma.activeTimer.findUnique({ where: { userId: viewer.userId } }))?.taskId ===
      task.id,
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
      authorName: c.author?.name ?? c.externalAuthor,
      createdAt: c.createdAt.toISOString(),
      linearUrl: c.externalUrl,
      fromLinear: c.source === "linear",
      sharedWithClient: c.sharedWithClient,
      canDelete: canModerate || c.authorId === viewer.userId,
    })),
  };
}
