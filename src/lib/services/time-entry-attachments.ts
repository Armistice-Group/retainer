import "server-only";
import { prisma } from "@/lib/prisma";
import { canViewProject } from "@/lib/project-access";
import { deleteStoredFile, readFile, storeFile } from "@/lib/file-storage";
import { sniffFileType } from "@/lib/file-type";
import { uploadLimitBytes } from "@/lib/services/documents";
import type { Prisma, Role } from "@/generated/prisma/client";

// Evidence on a time entry: screenshots (or PDFs) of the work. Anyone who can
// see the project can open them; the entry's owner and owners/admins can add
// and remove them, even after the entry is invoiced or its week approved —
// evidence doesn't change what was billed.

export const MAX_ATTACHMENTS_PER_ENTRY = 20;
const ATTACHMENT_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp", "application/pdf"]);
const EXTENSIONS: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

export class AttachmentError extends Error {}

type Ctx = { orgId: string; actorId: string; role: Role };

/** What the UI and API show for an attachment. */
export const attachmentSelect = {
  id: true,
  fileName: true,
  contentType: true,
  sizeBytes: true,
  clientVisible: true,
  createdAt: true,
} as const;

export type PreparedFile = { bytes: Buffer; contentType: string; fileName: string };

/**
 * Checks files before anything is saved: real type (from the bytes, not the
 * name), size, and the per-entry cap. Pasted screenshots arrive as
 * "image.png"; they get a dated name instead.
 */
export async function prepareAttachments(files: File[], existingCount = 0): Promise<PreparedFile[]> {
  const real = files.filter((f) => f.size > 0);
  if (existingCount + real.length > MAX_ATTACHMENTS_PER_ENTRY) {
    throw new AttachmentError(`An entry can have up to ${MAX_ATTACHMENTS_PER_ENTRY} attachments.`);
  }
  const limit = uploadLimitBytes();
  const prepared: PreparedFile[] = [];
  for (const file of real) {
    if (file.size > limit) {
      throw new AttachmentError(`${file.name} is over ${limit / 1024 / 1024}MB.`);
    }
    const bytes = Buffer.from(await file.arrayBuffer());
    const contentType = sniffFileType(bytes);
    if (!contentType || !ATTACHMENT_TYPES.has(contentType)) {
      throw new AttachmentError(`${file.name} isn't a PNG, JPEG, GIF, WebP or PDF.`);
    }
    prepared.push({ bytes, contentType, fileName: attachmentName(file.name, contentType) });
  }
  return prepared;
}

function attachmentName(name: string, contentType: string) {
  const ext = EXTENSIONS[contentType];
  const trimmed = name.trim().replace(/[\\/\r\n"]/g, "_").slice(-150);
  if (!trimmed || /^image\.(png|jpe?g|gif|webp)$/i.test(trimmed)) {
    const stamp = new Date().toISOString().slice(0, 19).replace("T", " ").replace(/:/g, ".");
    return `Screenshot ${stamp}.${ext}`;
  }
  return trimmed;
}

/** Stores already-checked files on an entry. */
export async function saveAttachments(
  ctx: Ctx,
  timeEntryId: string,
  files: PreparedFile[],
  opts: { clientVisible?: boolean } = {}
) {
  const created = [];
  for (const file of files) {
    const stored = await storeFile(file.bytes, {
      contentType: file.contentType,
      keyPrefix: `orgs/${ctx.orgId}/time-evidence`,
      fileName: file.fileName,
    });
    created.push(
      await prisma.timeEntryAttachment.create({
        data: {
          timeEntryId,
          fileName: file.fileName,
          contentType: file.contentType,
          sizeBytes: file.bytes.length,
          fileData: stored.fileData,
          storageKey: stored.storageKey,
          clientVisible: opts.clientVisible ?? false,
          uploadedById: ctx.actorId,
        },
        select: attachmentSelect,
      })
    );
  }
  return created;
}

/** The entry, if the actor may change its attachments. */
async function editableEntry(ctx: Ctx, timeEntryId: string) {
  const entry = await prisma.timeEntry.findUnique({
    where: { id: timeEntryId },
    select: { id: true, orgId: true, userId: true, project: true, _count: { select: { attachments: true } } },
  });
  if (!entry || entry.orgId !== ctx.orgId || !(await canViewProject(entry.project, ctx.actorId, ctx.role))) {
    throw new AttachmentError("Entry not found.");
  }
  if (entry.userId !== ctx.actorId && ctx.role !== "OWNER" && ctx.role !== "ADMIN") {
    throw new AttachmentError("You can only add evidence to your own time entries.");
  }
  return entry;
}

export async function addAttachments(
  ctx: Ctx,
  timeEntryId: string,
  files: File[],
  opts: { clientVisible?: boolean } = {}
) {
  const entry = await editableEntry(ctx, timeEntryId);
  const prepared = await prepareAttachments(files, entry._count.attachments);
  if (prepared.length === 0) throw new AttachmentError("Choose a file.");
  return saveAttachments(ctx, entry.id, prepared, opts);
}

async function editableAttachment(ctx: Ctx, attachmentId: string) {
  const attachment = await prisma.timeEntryAttachment.findUnique({
    where: { id: attachmentId },
    select: { id: true, storageKey: true, timeEntryId: true },
  });
  if (!attachment) throw new AttachmentError("Attachment not found.");
  await editableEntry(ctx, attachment.timeEntryId);
  return attachment;
}

export async function setAttachmentVisibility(ctx: Ctx, attachmentId: string, clientVisible: boolean) {
  const attachment = await editableAttachment(ctx, attachmentId);
  return prisma.timeEntryAttachment.update({
    where: { id: attachment.id },
    data: { clientVisible },
    select: attachmentSelect,
  });
}

export async function deleteAttachment(ctx: Ctx, attachmentId: string) {
  const attachment = await editableAttachment(ctx, attachmentId);
  await prisma.timeEntryAttachment.delete({ where: { id: attachment.id } });
  await deleteStoredFile(attachment);
}

/** Before entries are deleted: remove their files from object storage (the
 * rows go with the entries). */
export async function deleteEntryAttachmentFiles(where: Prisma.TimeEntryAttachmentWhereInput) {
  const stored = await prisma.timeEntryAttachment.findMany({
    where: { ...where, storageKey: { not: null } },
    select: { storageKey: true },
  });
  await Promise.all(stored.map((s) => deleteStoredFile(s)));
}

/** An entry's attachments, for someone in the org who can see its project;
 * null when they can't. */
export async function listEntryAttachments(ctx: Ctx, timeEntryId: string) {
  const entry = await prisma.timeEntry.findUnique({
    where: { id: timeEntryId },
    select: {
      orgId: true,
      project: true,
      attachments: { select: attachmentSelect, orderBy: { createdAt: "asc" } },
    },
  });
  if (!entry || entry.orgId !== ctx.orgId || !(await canViewProject(entry.project, ctx.actorId, ctx.role))) {
    return null;
  }
  return entry.attachments;
}

/** An attachment's bytes, for someone in the org who can see the project. */
export async function readAttachmentForMember(ctx: Ctx, attachmentId: string) {
  const attachment = await prisma.timeEntryAttachment.findUnique({
    where: { id: attachmentId },
    include: { timeEntry: { select: { orgId: true, project: true } } },
  });
  if (
    !attachment ||
    attachment.timeEntry.orgId !== ctx.orgId ||
    !(await canViewProject(attachment.timeEntry.project, ctx.actorId, ctx.role))
  ) {
    return null;
  }
  const bytes = await readFile(attachment);
  return bytes ? { doc: attachment, bytes } : null;
}

/** A client-visible attachment on one of this invoice's entries, when the
 * client has time detail on. */
export async function readAttachmentForInvoice(invoiceId: string, attachmentId: string) {
  const attachment = await prisma.timeEntryAttachment.findFirst({
    where: {
      id: attachmentId,
      clientVisible: true,
      timeEntry: {
        invoiceLineItem: { invoiceId },
        project: { client: { invoiceTimeDetail: true } },
      },
    },
  });
  if (!attachment) return null;
  const bytes = await readFile(attachment);
  return bytes ? { doc: attachment, bytes } : null;
}
