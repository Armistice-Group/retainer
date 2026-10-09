"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireOrgContext } from "@/lib/org-context";
import { clientDocumentSchema } from "@/lib/validations/client";
import type { ActionState } from "@/actions/auth";
import { canManageDocument } from "@/lib/document-access";
import type { DocumentAccess } from "@/generated/prisma/client";

const MAX_DOCUMENT_BYTES = 5 * 1024 * 1024;
const ALLOWED_DOCUMENT_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "application/pdf"]);

export async function uploadClientDocumentAction(
  clientId: string,
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const { org, user } = await requireOrgContext();

  const client = await prisma.client.findUnique({ where: { id: clientId } });
  const accessInput = await parseAccess(org.id, formData);
  if ("error" in accessInput) return { error: accessInput.error };
  if (!client || client.orgId !== org.id) return { error: "Client not found." };

  const parsed = clientDocumentSchema.safeParse({
    clientId,
    type: formData.get("type") || "OTHER",
    label: formData.get("label"),
  });
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose a file to upload." };
  }
  if (!ALLOWED_DOCUMENT_TYPES.has(file.type)) {
    return { error: "File must be a PNG, JPEG, WebP, or PDF." };
  }
  if (file.size > MAX_DOCUMENT_BYTES) {
    return { error: "File must be under 5MB." };
  }

  const fileData = Buffer.from(await file.arrayBuffer());

  await prisma.clientDocument.create({
    data: {
      clientId,
      type: parsed.data.type,
      label: parsed.data.label || null,
      fileName: file.name,
      fileData,
      contentType: file.type,
      uploadedById: user.id,
      ...accessInput,
    },
  });

  revalidatePath(`/clients/${clientId}`);
  return null;
}

export async function deleteClientDocumentAction(documentId: string, clientId: string) {
  const { org, user, role } = await requireOrgContext();

  const document = await prisma.clientDocument.findUnique({
    where: { id: documentId },
    include: { client: true },
  });
  if (!document || document.client.orgId !== org.id || document.clientId !== clientId) {
    throw new Error("Document not found.");
  }
  if (!canManageDocument(document, user.id, role)) {
    throw new Error("Only owners, admins who can see it, and its uploader can delete this document.");
  }

  await prisma.clientDocument.delete({ where: { id: documentId } });
  revalidatePath(`/clients/${clientId}`);
}

export async function setDocumentAccessAction(
  documentId: string,
  clientId: string,
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const { org, user, role } = await requireOrgContext();
  const document = await prisma.clientDocument.findUnique({
    where: { id: documentId },
    include: { client: true },
  });
  if (!document || document.client.orgId !== org.id || document.clientId !== clientId) {
    return { error: "Document not found." };
  }
  if (!canManageDocument(document, user.id, role)) {
    return { error: "You can't change who sees this document." };
  }
  const access = await parseAccess(org.id, formData);
  if ("error" in access) return { error: access.error };

  await prisma.clientDocument.update({ where: { id: documentId }, data: access });
  revalidatePath(`/clients/${clientId}`);
  revalidatePath(`/clients/${clientId}/documents/${documentId}`);
  return { saved: true };
}

/** access + allowedUserIds from a form, keeping only real org members. */
async function parseAccess(
  orgId: string,
  formData: FormData
): Promise<{ access: DocumentAccess; allowedUserIds: string[] } | { error: string }> {
  const raw = (formData.get("access") as string | null) ?? "EVERYONE";
  if (!["EVERYONE", "ADMINS", "SELECTED"].includes(raw)) return { error: "Choose who can see it." };
  const access = raw as DocumentAccess;
  if (access !== "SELECTED") return { access, allowedUserIds: [] };

  const wanted = formData.getAll("allowedUserIds").map(String);
  const members = await prisma.membership.findMany({
    where: { orgId, userId: { in: wanted } },
    select: { userId: true },
  });
  const allowedUserIds = members.map((m) => m.userId);
  if (allowedUserIds.length === 0) return { error: "Pick at least one person." };
  return { access, allowedUserIds };
}
