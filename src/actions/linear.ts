"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireOrgContext, requireRole } from "@/lib/org-context";
import { canViewProject } from "@/lib/project-access";
import {
  getLinearAccessToken,
  listTeams,
  listTeamFilters,
  type LinearTeamOption,
  type LinearProjectOption,
  type LinearLabelOption,
} from "@/lib/integrations/linear";
import { pullLinearIssues, LinearSyncError, type SyncResult } from "@/lib/services/linear-sync";
import type { ActionState } from "@/actions/auth";

async function orgConnection() {
  const { org } = await requireOrgContext();
  return prisma.linearConnection.findUnique({ where: { orgId: org.id } });
}

export async function listLinearTeamsAction(): Promise<{
  teams: LinearTeamOption[];
  error: string | null;
}> {
  const connection = await orgConnection();
  if (!connection) return { teams: [], error: "Connect Linear in Settings first." };
  try {
    return { teams: await listTeams(await getLinearAccessToken(connection)), error: null };
  } catch {
    return { teams: [], error: "Couldn't list Linear teams. Try reconnecting in Settings." };
  }
}

/** Linear projects and labels in a team, for narrowing what a project syncs. */
export async function listLinearTeamFiltersAction(teamId: string): Promise<{
  projects: LinearProjectOption[];
  labels: LinearLabelOption[];
  error: string | null;
}> {
  const connection = await orgConnection();
  if (!connection) return { projects: [], labels: [], error: "Connect Linear in Settings first." };
  try {
    return {
      ...(await listTeamFilters(await getLinearAccessToken(connection), teamId)),
      error: null,
    };
  } catch {
    return { projects: [], labels: [], error: "Couldn't load this team's projects and labels." };
  }
}

/** Links (or re-links) a project to a Linear team, optionally narrowed to a
 * Linear project and/or labels. Several projects can share one team. */
export async function linkProjectToLinearAction(
  projectId: string,
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { org, user, role } = await requireOrgContext();
  requireRole(role, ["OWNER", "ADMIN"]);

  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project || project.orgId !== org.id) return { error: "Project not found." };
  if (!(await canViewProject(project, user.id, role))) return { error: "Project not found." };
  if (!(await orgConnection())) return { error: "Connect Linear in Settings first." };

  const teamId = (formData.get("teamId") as string | null) || "";
  if (!teamId) return { error: "Choose a team." };
  const labelIds = formData.getAll("labelIds").map(String).filter(Boolean);
  const labelNames = formData.getAll("labelNames").map(String).filter(Boolean);

  const data = {
    source: "linear",
    externalId: teamId,
    externalName: (formData.get("teamName") as string | null) || null,
    linearProjectId: (formData.get("linearProjectId") as string | null) || null,
    linearProjectName: (formData.get("linearProjectName") as string | null) || null,
    labelIds,
    labelNames: labelNames.length === labelIds.length ? labelNames : labelIds,
    pushChanges: formData.get("pushChanges") === "on",
  };

  await prisma.externalProjectLink.upsert({
    where: { projectId },
    create: { projectId, ...data },
    update: data,
  });

  revalidatePath(`/projects/${projectId}`);
  return { saved: true };
}

export async function unlinkLinearProjectAction(projectId: string) {
  const { org, role } = await requireOrgContext();
  requireRole(role, ["OWNER", "ADMIN"]);

  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project || project.orgId !== org.id) throw new Error("Project not found.");

  await prisma.externalProjectLink.deleteMany({ where: { projectId, source: "linear" } });
  revalidatePath(`/projects/${projectId}`);
}

export async function syncLinearTasksAction(
  projectId: string,
): Promise<{ result: SyncResult | null; error: string | null }> {
  const { org, user, role } = await requireOrgContext();

  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project || project.orgId !== org.id) return { result: null, error: "Project not found." };
  if (!(await canViewProject(project, user.id, role))) {
    return { result: null, error: "Project not found." };
  }

  try {
    const result = await pullLinearIssues(projectId);
    revalidatePath(`/projects/${projectId}`);
    return { result, error: null };
  } catch (err) {
    console.warn("[linear] Sync failed", err);
    return {
      result: null,
      error:
        err instanceof LinearSyncError
          ? err.message
          : "Couldn't pull issues from Linear. Try reconnecting in Settings → Integrations.",
    };
  }
}
