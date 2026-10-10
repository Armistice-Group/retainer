import "server-only";
import { prisma } from "@/lib/prisma";
import { canViewProject, projectVisibilityWhere } from "@/lib/project-access";
import { canManageDocument, documentVisibilityWhere } from "@/lib/document-access";
import { detectLink } from "@/lib/integrations/storage/detect";
import { enrichLink } from "@/lib/integrations/storage/enrich";
import { deleteStoredFile, storeFile } from "@/lib/file-storage";
import type {
  ClientDocumentType,
  DocumentAccess,
  DocumentAudience,
  Role,
} from "@/generated/prisma/client";

export class DocumentError extends Error {}

export type DocumentContext = { orgId: string; actorId: string; role: Role };

export type DocumentMeta = {
  clientId: string;
  projectId?: string | null;
  type: ClientDocumentType;
  label?: string | null;
  audience: DocumentAudience;
  access: DocumentAccess;
  allowedUserIds: string[];
};

const DB_MAX_BYTES = 5 * 1024 * 1024;
const STORAGE_MAX_BYTES = 25 * 1024 * 1024;
const ALLOWED_UPLOAD_TYPES = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "text/plain",
  "text/csv",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
]);

/** Storage providers this person has connected (for browsing to link). */
async function connectedProviders(userId: string): Promise<{ provider: string }[]> {
  return prisma.userConnection.findMany({ where: { userId }, select: { provider: true } });
}

export function uploadLimitBytes() {
  return process.env.S3_BUCKET ? STORAGE_MAX_BYTES : DB_MAX_BYTES;
}

/** Client (and project, if given) must be in the org and visible to the actor. */
async function assertTarget(ctx: DocumentContext, clientId: string, projectId?: string | null) {
  const client = await prisma.client.findUnique({ where: { id: clientId } });
  if (!client || client.orgId !== ctx.orgId) throw new DocumentError("Client not found.");
  if (projectId) {
    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project || project.clientId !== clientId || !(await canViewProject(project, ctx.actorId, ctx.role))) {
      throw new DocumentError("Project not found.");
    }
  }
}

/** Keeps only real org members in a "specific people" list. */
async function cleanAccess(orgId: string, access: DocumentAccess, userIds: string[]) {
  if (access !== "SELECTED") return { access, allowedUserIds: [] };
  const members = await prisma.membership.findMany({
    where: { orgId, userId: { in: userIds } },
    select: { userId: true },
  });
  if (members.length === 0) throw new DocumentError("Pick at least one person.");
  return { access, allowedUserIds: members.map((m) => m.userId) };
}

export async function addUploadedDocument(ctx: DocumentContext, meta: DocumentMeta, file: File) {
  await assertTarget(ctx, meta.clientId, meta.projectId);
  if (file.size === 0) throw new DocumentError("Choose a file to upload.");
  if (!ALLOWED_UPLOAD_TYPES.has(file.type)) {
    throw new DocumentError("Upload a PDF, image, Word, Excel, PowerPoint, text or CSV file — or link it instead.");
  }
  const limit = uploadLimitBytes();
  if (file.size > limit) {
    throw new DocumentError(`Files must be under ${limit / 1024 / 1024}MB — link larger ones from where they live instead.`);
  }
  const stored = await storeFile(Buffer.from(await file.arrayBuffer()), {
    contentType: file.type,
    keyPrefix: `orgs/${ctx.orgId}/documents`,
    fileName: file.name,
  });
  return prisma.clientDocument.create({
    data: {
      clientId: meta.clientId,
      projectId: meta.projectId || null,
      type: meta.type,
      label: meta.label?.trim() || null,
      audience: meta.audience,
      ...(await cleanAccess(ctx.orgId, meta.access, meta.allowedUserIds)),
      source: "UPLOAD",
      fileName: file.name.slice(0, 255),
      ...stored,
      contentType: file.type,
      sizeBytes: file.size,
      uploadedById: ctx.actorId,
    },
  });
}

export async function addLinkedDocument(ctx: DocumentContext, meta: DocumentMeta, rawUrl: string) {
  await assertTarget(ctx, meta.clientId, meta.projectId);
  const link = detectLink(rawUrl);
  if (!link) throw new DocumentError("Paste a full link, starting with https://.");
  const details = await enrichLink(ctx.actorId, link);
  const title = (meta.label?.trim() || details?.title || link.title || link.label).slice(0, 255);
  return prisma.clientDocument.create({
    data: {
      clientId: meta.clientId,
      projectId: meta.projectId || null,
      type: meta.type,
      label: null,
      audience: meta.audience,
      ...(await cleanAccess(ctx.orgId, meta.access, meta.allowedUserIds)),
      source: link.provider,
      fileName: title,
      externalUrl: details?.url || link.url,
      externalId: details?.externalId ?? link.externalId,
      externalKind: details?.kind ?? link.kind,
      externalModifiedAt: details?.modifiedAt ?? null,
      contentType: details?.contentType ?? null,
      sizeBytes: details?.sizeBytes ?? null,
      uploadedById: ctx.actorId,
    },
  });
}

async function manageable(ctx: DocumentContext, documentId: string) {
  const doc = await prisma.clientDocument.findUnique({
    where: { id: documentId },
    include: { client: true },
  });
  if (!doc || doc.client.orgId !== ctx.orgId) throw new DocumentError("Document not found.");
  if (!canManageDocument(doc, ctx.actorId, ctx.role)) {
    throw new DocumentError("Only owners, admins who can see it, and whoever added it can change this document.");
  }
  return doc;
}

export async function deleteDocument(ctx: DocumentContext, documentId: string) {
  const doc = await manageable(ctx, documentId);
  await prisma.clientDocument.delete({ where: { id: documentId } });
  await deleteStoredFile(doc);
  return doc;
}

export async function updateDocumentSharing(
  ctx: DocumentContext,
  documentId: string,
  input: { access: DocumentAccess; allowedUserIds: string[]; audience: DocumentAudience }
) {
  const doc = await manageable(ctx, documentId);
  await prisma.clientDocument.update({
    where: { id: documentId },
    data: {
      audience: input.audience,
      ...(await cleanAccess(ctx.orgId, input.access, input.allowedUserIds)),
    },
  });
  return doc;
}

/** Re-reads a linked item's title and dates from its provider. */
export async function refreshLinkedDocument(ctx: DocumentContext, documentId: string) {
  const doc = await prisma.clientDocument.findUnique({ where: { id: documentId }, include: { client: true } });
  if (!doc || doc.client.orgId !== ctx.orgId || !doc.externalUrl) throw new DocumentError("Document not found.");
  const link = detectLink(doc.externalUrl);
  if (!link) return doc;
  const details = await enrichLink(ctx.actorId, link);
  if (!details) return doc;
  return prisma.clientDocument.update({
    where: { id: documentId },
    data: {
      ...(details.title ? { fileName: details.title.slice(0, 255) } : {}),
      externalModifiedAt: details.modifiedAt ?? doc.externalModifiedAt,
      contentType: details.contentType ?? doc.contentType,
      sizeBytes: details.sizeBytes ?? doc.sizeBytes,
      externalKind: details.kind ?? doc.externalKind,
    },
  });
}

/** What a Documents card shows: a client's documents (all of its projects'
 * too, labelled), or one project's — only ones the viewer may see. */
export async function documentCardData(
  viewer: { orgId: string; userId: string; role: Role },
  scope: { clientId: string; projectId?: string }
) {
  const [docs, memberships, connections] = await Promise.all([
    prisma.clientDocument.findMany({
      where: {
        clientId: scope.clientId,
        ...(scope.projectId ? { projectId: scope.projectId } : {}),
        AND: [
          documentVisibilityWhere(viewer.userId, viewer.role),
          // Never show a confidential project's documents to people who can't
          // see it. (Owners and admins see every project.)
          viewer.role === "OWNER" || viewer.role === "ADMIN"
            ? {}
            : {
                OR: [
                  { projectId: null },
                  { project: { is: projectVisibilityWhere(viewer.userId, viewer.role) } },
                ],
              },
        ],
      },
      orderBy: [{ uploadedAt: "desc" }],
      select: {
        id: true,
        type: true,
        label: true,
        fileName: true,
        source: true,
        externalKind: true,
        externalModifiedAt: true,
        audience: true,
        access: true,
        allowedUserIds: true,
        uploadedAt: true,
        uploadedById: true,
        project: { select: { name: true } },
      },
    }),
    prisma.membership.findMany({
      where: { orgId: viewer.orgId },
      include: { user: { select: { id: true, name: true } } },
      orderBy: { user: { name: "asc" } },
    }),
    connectedProviders(viewer.userId),
  ]);
  return {
    documents: docs.map((d) => ({
      id: d.id,
      title: d.label || d.fileName,
      type: d.type,
      source: d.source,
      kind: d.externalKind,
      audience: d.audience,
      access: d.access,
      allowedUserIds: d.allowedUserIds,
      date: (d.externalModifiedAt ?? d.uploadedAt).toISOString(),
      modified: !!d.externalModifiedAt,
      projectName: scope.projectId ? null : (d.project?.name ?? null),
      canManage: canManageDocument(d, viewer.userId, viewer.role),
    })),
    members: memberships.map((m) => ({ id: m.user.id, name: m.user.name, role: m.role })),
    connectedProviders: [...new Set(connections.map((c) => c.provider))],
    uploadLimitMb: uploadLimitBytes() / 1024 / 1024,
  };
}

const sharedSelect = {
  id: true,
  type: true,
  label: true,
  fileName: true,
  source: true,
  externalKind: true,
  externalUrl: true,
  uploadedAt: true,
  project: { select: { name: true } },
} as const;

/** Documents marked for the client, for a share page: a project link shows
 * that project's plus client-wide ones; a client link shows client-wide ones
 * and those of its non-confidential projects. */
export async function clientVisibleDocuments(scope: { clientId: string; projectId?: string }) {
  return prisma.clientDocument.findMany({
    where: {
      clientId: scope.clientId,
      audience: "CLIENT",
      OR: scope.projectId
        ? [{ projectId: scope.projectId }, { projectId: null }]
        : [{ projectId: null }, { project: { confidential: false } }],
    },
    orderBy: { uploadedAt: "desc" },
    select: sharedSelect,
  });
}

/** One shared upload's bytes, if it really is shared under this scope. */
export async function sharedUpload(scope: { clientId: string; projectId?: string }, documentId: string) {
  const visible = await clientVisibleDocuments(scope);
  if (!visible.some((d) => d.id === documentId)) return null;
  const doc = await prisma.clientDocument.findUnique({ where: { id: documentId } });
  if (!doc || doc.source !== "UPLOAD") return null;
  const { readFile } = await import("@/lib/file-storage");
  const bytes = await readFile(doc);
  return bytes ? { doc, bytes } : null;
}
