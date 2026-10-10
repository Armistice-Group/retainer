import "server-only";
import { prisma } from "@/lib/prisma";
import { canViewProject, projectVisibilityWhere } from "@/lib/project-access";
import {
  LABEL_MAX,
  NOTE_MAX,
  SECRET_MESSAGE,
  checkVaultUrl,
  isItemKind,
  itemKindLabel,
  looksLikeSecret,
  openInLabel,
  vaultProviderLabel,
} from "@/lib/vault-links";
import type { Role } from "@/generated/prisma/client";

// Links to password-manager items on a client or project ("Credentials").
// Only the item's URL, a label and a non-secret note are stored; the vault
// itself decides who can open the item. Owners and admins add, edit and
// remove them; everyone sees the ones on clients and projects they can see.
// Never shown on client-facing pages (share links, invoices, estimates) or
// in alerts.

export class VaultLinkError extends Error {}

export type VaultLinkContext = { orgId: string; actorId: string; role: Role };
export type VaultLinkViewer = { orgId: string; userId: string; role: Role };

export type VaultLinkInput = {
  projectId?: string | null;
  label: string;
  note?: string | null;
  url: string;
  itemKind?: string | null;
};

export function canManageVaultLinks(role: Role) {
  return role === "OWNER" || role === "ADMIN";
}

/** Prisma `where` fragment: client-wide links, plus those on projects the
 * viewer can see (confidential ones only for people on them). */
export function vaultLinkVisibilityWhere(userId: string, role: Role) {
  if (role === "OWNER" || role === "ADMIN") return {};
  return {
    OR: [{ projectId: null }, { project: { is: projectVisibilityWhere(userId, role) } }],
  };
}

function requireManager(ctx: VaultLinkContext) {
  if (!canManageVaultLinks(ctx.role)) {
    throw new VaultLinkError("Only owners and admins can add or change credential links.");
  }
}

async function assertClient(orgId: string, clientId: string) {
  const client = await prisma.client.findUnique({ where: { id: clientId }, select: { id: true, orgId: true } });
  if (!client || client.orgId !== orgId) throw new VaultLinkError("Client not found.");
  return client;
}

/** The project must belong to this client (and so this org) and be visible. */
async function assertProject(viewer: { userId: string; role: Role }, clientId: string, projectId: string) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, clientId: true, confidential: true },
  });
  if (!project || project.clientId !== clientId || !(await canViewProject(project, viewer.userId, viewer.role))) {
    throw new VaultLinkError("Project not found.");
  }
  return project;
}

/** Validates and normalises what was typed. Rejects anything that looks
 * like a secret rather than a pointer to one. */
function clean(input: VaultLinkInput) {
  const label = input.label.trim();
  const note = (input.note ?? "").trim();
  if (!label) throw new VaultLinkError("Give it a label, e.g. Client AWS root.");
  if (label.length > LABEL_MAX) throw new VaultLinkError(`Keep the label under ${LABEL_MAX} characters.`);
  if (note.length > NOTE_MAX) throw new VaultLinkError(`Keep the note under ${NOTE_MAX} characters.`);
  if (looksLikeSecret(label) || looksLikeSecret(note)) throw new VaultLinkError(SECRET_MESSAGE);
  const checked = checkVaultUrl(input.url);
  if (!checked.ok) throw new VaultLinkError(checked.error);
  const kind = (input.itemKind ?? "").trim();
  return {
    label,
    note: note || null,
    url: checked.url,
    provider: checked.provider,
    itemKind: kind && isItemKind(kind) ? kind : null,
  };
}

export async function createVaultLink(ctx: VaultLinkContext, clientId: string, input: VaultLinkInput) {
  requireManager(ctx);
  await assertClient(ctx.orgId, clientId);
  const projectId = input.projectId?.trim() || null;
  if (projectId) await assertProject({ userId: ctx.actorId, role: ctx.role }, clientId, projectId);
  return prisma.vaultLink.create({
    data: { ...clean(input), orgId: ctx.orgId, clientId, projectId, createdById: ctx.actorId },
  });
}

async function manageable(ctx: VaultLinkContext, id: string) {
  requireManager(ctx);
  const link = await prisma.vaultLink.findUnique({ where: { id } });
  if (!link || link.orgId !== ctx.orgId) throw new VaultLinkError("Credential link not found.");
  return link;
}

export async function updateVaultLink(ctx: VaultLinkContext, id: string, input: VaultLinkInput) {
  const link = await manageable(ctx, id);
  const projectId = input.projectId === undefined ? link.projectId : input.projectId?.trim() || null;
  if (projectId && projectId !== link.projectId) {
    await assertProject({ userId: ctx.actorId, role: ctx.role }, link.clientId, projectId);
  }
  const updated = await prisma.vaultLink.update({
    where: { id },
    data: { ...clean(input), projectId },
  });
  return { before: link, after: updated };
}

export async function deleteVaultLink(ctx: VaultLinkContext, id: string) {
  const link = await manageable(ctx, id);
  await prisma.vaultLink.delete({ where: { id } });
  return link;
}

export type VaultLinkItem = {
  id: string;
  label: string;
  note: string | null;
  url: string;
  provider: string;
  providerLabel: string;
  openLabel: string;
  itemKind: string | null;
  itemKindLabel: string | null;
  projectId: string | null;
  projectName: string | null;
  createdAt: string;
  updatedAt: string;
};

/**
 * Credential links the viewer may see on a client — or, with `projectId`,
 * on one project (plus the client-wide ones when `includeClientWide`).
 * Throws VaultLinkError for a client outside the org or a project the
 * viewer can't see, so callers answer "not found" without leaking either.
 */
export async function listVaultLinks(
  viewer: VaultLinkViewer,
  scope: { clientId: string; projectId?: string | null; includeClientWide?: boolean }
): Promise<VaultLinkItem[]> {
  await assertClient(viewer.orgId, scope.clientId);
  if (scope.projectId) await assertProject(viewer, scope.clientId, scope.projectId);
  const links = await prisma.vaultLink.findMany({
    where: {
      orgId: viewer.orgId,
      clientId: scope.clientId,
      ...(scope.projectId
        ? scope.includeClientWide
          ? { OR: [{ projectId: scope.projectId }, { projectId: null }] }
          : { projectId: scope.projectId }
        : {}),
      AND: [vaultLinkVisibilityWhere(viewer.userId, viewer.role)],
    },
    orderBy: [{ label: "asc" }, { createdAt: "asc" }],
    include: { project: { select: { name: true } } },
  });
  return links.map((l) => ({
    id: l.id,
    label: l.label,
    note: l.note,
    url: l.url,
    provider: l.provider,
    providerLabel: vaultProviderLabel(l.provider),
    openLabel: openInLabel(l.provider),
    itemKind: l.itemKind,
    itemKindLabel: itemKindLabel(l.itemKind),
    projectId: l.projectId,
    projectName: l.project?.name ?? null,
    createdAt: l.createdAt.toISOString(),
    updatedAt: l.updatedAt.toISOString(),
  }));
}

/** The API/MCP shape of a credential link (never a secret: there isn't one). */
export function vaultLinkJson(l: VaultLinkItem) {
  return {
    id: l.id,
    label: l.label,
    note: l.note,
    url: l.url,
    provider: l.provider,
    providerName: l.providerLabel,
    itemKind: l.itemKind,
    projectId: l.projectId,
    projectName: l.projectName,
    createdAt: l.createdAt,
    updatedAt: l.updatedAt,
  };
}
