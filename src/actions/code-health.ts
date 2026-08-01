"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireOrgContext, requireRole } from "@/lib/org-context";
import { accessTokenFor, listAccessibleRepos, type GithubRepoOption } from "@/lib/integrations/github";
import type { ActionState } from "@/actions/auth";

export async function listGithubReposAction(): Promise<{
  repos: GithubRepoOption[];
  error: string | null;
}> {
  const { org } = await requireOrgContext();

  const connection = await prisma.githubConnection.findUnique({ where: { orgId: org.id } });
  if (!connection) return { repos: [], error: "Connect GitHub in Settings first." };

  try {
    const repos = await listAccessibleRepos(accessTokenFor(connection));
    return { repos, error: null };
  } catch {
    return { repos: [], error: "Couldn't list GitHub repos. Try reconnecting in Settings." };
  }
}

export async function connectRepoAction(
  projectId: string,
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const { org } = await requireOrgContext();

  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project || project.orgId !== org.id) return { error: "Project not found." };

  const connection = await prisma.githubConnection.findUnique({ where: { orgId: org.id } });
  if (!connection) return { error: "Connect GitHub in Settings first." };

  const fullName = formData.get("repo") as string | null;
  const [owner, name] = (fullName ?? "").split("/");
  if (!owner || !name) return { error: "Choose a repo." };

  await prisma.repo.upsert({
    where: { projectId },
    create: { projectId, githubOwner: owner, githubName: name, connectionId: connection.id },
    update: { githubOwner: owner, githubName: name, connectionId: connection.id },
  });

  revalidatePath(`/projects/${projectId}`);
  return null;
}

export async function disconnectRepoAction(projectId: string) {
  const { org, role } = await requireOrgContext();
  requireRole(role, ["OWNER", "ADMIN"]);

  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project || project.orgId !== org.id) throw new Error("Project not found.");

  await prisma.repo.deleteMany({ where: { projectId } });
  revalidatePath(`/projects/${projectId}`);
}

export async function setCodeHealthGateAction(projectId: string, enabled: boolean) {
  const { org, role } = await requireOrgContext();
  requireRole(role, ["OWNER", "ADMIN"]);

  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project || project.orgId !== org.id) throw new Error("Project not found.");

  await prisma.project.update({ where: { id: projectId }, data: { codeHealthGateEnabled: enabled } });
  revalidatePath(`/projects/${projectId}`);
}
