"use server";

import { revalidatePath } from "next/cache";
import { requireOrgContext } from "@/lib/org-context";
import {
  addAttachments,
  AttachmentError,
  deleteAttachment,
  setAttachmentVisibility,
} from "@/lib/services/time-entry-attachments";

export type AttachmentActionResult = { error: string } | null;

async function ctx() {
  const { org, user, role } = await requireOrgContext();
  return { orgId: org.id, actorId: user.id, role };
}

function revalidate() {
  revalidatePath("/time");
  revalidatePath("/projects", "layout");
}

async function attempt(work: () => Promise<unknown>): Promise<AttachmentActionResult> {
  try {
    await work();
  } catch (err) {
    if (err instanceof AttachmentError) return { error: err.message };
    throw err;
  }
  revalidate();
  return null;
}

/** Files (picked, dropped or pasted) added to an entry's evidence. */
export async function addTimeEntryAttachmentsAction(
  timeEntryId: string,
  formData: FormData
): Promise<AttachmentActionResult> {
  const c = await ctx();
  const files = formData.getAll("attachments").filter((f): f is File => f instanceof File);
  return attempt(() =>
    addAttachments(c, timeEntryId, files, { clientVisible: formData.get("clientVisible") === "on" })
  );
}

export async function setTimeEntryAttachmentVisibilityAction(
  attachmentId: string,
  clientVisible: boolean
): Promise<AttachmentActionResult> {
  const c = await ctx();
  return attempt(() => setAttachmentVisibility(c, attachmentId, clientVisible));
}

export async function deleteTimeEntryAttachmentAction(attachmentId: string): Promise<AttachmentActionResult> {
  const c = await ctx();
  return attempt(() => deleteAttachment(c, attachmentId));
}
