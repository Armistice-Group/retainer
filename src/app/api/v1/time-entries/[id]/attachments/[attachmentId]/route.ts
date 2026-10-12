import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authenticateApiRequest, unauthorized } from "@/lib/api-auth";
import { fileResponse } from "@/lib/file-response";
import {
  AttachmentError,
  deleteAttachment,
  readAttachmentForMember,
  setAttachmentVisibility,
} from "@/lib/services/time-entry-attachments";

type Params = { params: Promise<{ id: string; attachmentId: string }> };

function context(ctx: NonNullable<Awaited<ReturnType<typeof authenticateApiRequest>>>) {
  return { orgId: ctx.orgId, actorId: ctx.actorId, role: ctx.role };
}

/** The attachment, if it's on this entry. */
async function onEntry(entryId: string, attachmentId: string) {
  return prisma.timeEntryAttachment.findFirst({
    where: { id: attachmentId, timeEntryId: entryId },
    select: { id: true },
  });
}

function failure(err: unknown) {
  if (err instanceof AttachmentError) {
    const missing = /not found/i.test(err.message);
    return Response.json({ error: err.message }, { status: missing ? 404 : 403 });
  }
  throw err;
}

/** The file itself. */
export async function GET(req: Request, { params }: Params) {
  const ctx = await authenticateApiRequest(req);
  if (!ctx) return unauthorized();
  const { id, attachmentId } = await params;
  const file = (await onEntry(id, attachmentId))
    ? await readAttachmentForMember(context(ctx), attachmentId)
    : null;
  if (!file) return Response.json({ error: "Attachment not found." }, { status: 404 });
  return fileResponse(file);
}

const patchSchema = z.object({ clientVisible: z.boolean() });

export async function PATCH(req: Request, { params }: Params) {
  const ctx = await authenticateApiRequest(req);
  if (!ctx) return unauthorized();
  const { id, attachmentId } = await params;
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten().fieldErrors }, { status: 422 });
  }
  if (!(await onEntry(id, attachmentId))) {
    return Response.json({ error: "Attachment not found." }, { status: 404 });
  }
  try {
    const attachment = await setAttachmentVisibility(context(ctx), attachmentId, parsed.data.clientVisible);
    return Response.json({ attachment });
  } catch (err) {
    return failure(err);
  }
}

export async function DELETE(req: Request, { params }: Params) {
  const ctx = await authenticateApiRequest(req);
  if (!ctx) return unauthorized();
  const { id, attachmentId } = await params;
  if (!(await onEntry(id, attachmentId))) {
    return Response.json({ error: "Attachment not found." }, { status: 404 });
  }
  try {
    await deleteAttachment(context(ctx), attachmentId);
    return Response.json({ ok: true });
  } catch (err) {
    return failure(err);
  }
}
