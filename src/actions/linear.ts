"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireOrgContext, requireRole } from "@/lib/org-context";
import { canViewProject } from "@/lib/project-access";
import {
  accessTokenFor,
  listTeams,
  listTeamIssues,
  mapLinearStateType,
  type LinearTeamOption,
} from "@/lib/integrations/linear";
import type { ActionState } from "@/actions/auth";

export async function listLinearTeamsAction(): Promise<{
  teams: LinearTeamOption[];
  error: string | null;
}> {
  const { org } = await requireOrgContext();

  const connection = await prisma.linearConnection.findUnique({ where: { orgId: org.id } });
  if (!connection) return { teams: [], error: "Connect Linear in Settings first." };

  try {
    const teams = await listTeams(accessTokenFor(connection));
    return { teams, error: null };
  } catch {
    return { teams: [], error: "Couldn't list Linear teams. Try reconnecting in Settings." };
  }
}

export async function linkProjectToLinearTeamAction(
  projectId: string,
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const { org, user, role } = await requireOrgContext();

  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project || project.orgId !== org.id) return { error: "Project not found." };
  if (!(await canViewProject(project, user.id, role))) return { error: "Project not found." };

  const connection = await prisma.linearConnection.findUnique({ where: { orgId: org.id } });
  if (!connection) return { error: "Connect Linear in Settings first." };

  const teamId = formData.get("teamId") as string | null;
  const teamName = (formData.get("teamName") as string | null) || null;
  if (!teamId) return { error: "Choose a team." };

  await prisma.externalProjectLink.upsert({
    where: { projectId },
    create: { projectId, source: "linear", externalId: teamId, externalName: teamName },
    update: { source: "linear", externalId: teamId, externalName: teamName },
  });

  revalidatePath(`/projects/${projectId}`);
  return null;
}

export async function unlinkLinearProjectAction(projectId: string) {
  const { org, role } = await requireOrgContext();
  requireRole(role, ["OWNER", "ADMIN"]);

  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project || project.orgId !== org.id) throw new Error("Project not found.");

  await prisma.externalProjectLink.deleteMany({
    where: { projectId, source: "linear" },
  });
  revalidatePath(`/projects/${projectId}`);
}

export async function syncLinearTasksAction(
  projectId: string
): Promise<{ synced: number; error: string | null }> {
  const { org, user, role } = await requireOrgContext();

  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project || project.orgId !== org.id) return { synced: 0, error: "Project not found." };
  if (!(await canViewProject(project, user.id, role))) {
    return { synced: 0, error: "Project not found." };
  }

  const link = await prisma.externalProjectLink.findUnique({ where: { projectId } });
  if (!link || link.source !== "linear") {
    return { synced: 0, error: "This project isn't linked to a Linear team." };
  }

  const connection = await prisma.linearConnection.findUnique({ where: { orgId: org.id } });
  if (!connection) return { synced: 0, error: "Connect Linear in Settings first." };

  let issues;
  try {
    issues = await listTeamIssues(accessTokenFor(connection), link.externalId);
  } catch {
    return { synced: 0, error: "Couldn't pull issues from Linear. Try reconnecting in Settings." };
  }

  const orgUsers = await prisma.membership.findMany({
    where: { orgId: org.id },
    include: { user: { select: { id: true, email: true } } },
  });
  const userIdByEmail = new Map(orgUsers.map((m) => [m.user.email.toLowerCase(), m.user.id]));

  let synced = 0;
  for (const issue of issues) {
    const assigneeId = issue.assignee?.email
      ? (userIdByEmail.get(issue.assignee.email.toLowerCase()) ?? null)
      : null;
    const status = mapLinearStateType(issue.state.type);

    const existingLink = await prisma.externalTaskLink.findUnique({
      where: { source_externalId: { source: "linear", externalId: issue.id } },
    });

    if (existingLink) {
      await prisma.task.update({
        where: { id: existingLink.taskId },
        data: { title: issue.title, description: issue.description, status, assigneeId },
      });
      await prisma.externalTaskLink.update({
        where: { id: existingLink.id },
        data: { externalUrl: issue.url, lastSyncedAt: new Date() },
      });
    } else {
      const task = await prisma.task.create({
        data: { projectId, title: issue.title, description: issue.description, status, assigneeId },
      });
      await prisma.externalTaskLink.create({
        data: {
          taskId: task.id,
          source: "linear",
          externalId: issue.id,
          externalUrl: issue.url,
          lastSyncedAt: new Date(),
        },
      });
    }
    synced++;
  }

  revalidatePath(`/projects/${projectId}`);
  return { synced, error: null };
}
