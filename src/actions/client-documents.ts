"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireOrgContext } from "@/lib/org-context";
import { clientDocumentSchema } from "@/lib/validations/client";
import type { ActionState } from "@/actions/auth";

const MAX_DOCUMENT_BYTES = 5 * 1024 * 1024;
const ALLOWED_DOCUMENT_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "application/pdf"]);

export async function uploadClientDocumentAction(
  clientId: string,
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const { org, user } = await requireOrgContext();

  const client = await prisma.client.findUnique({ where: { id: clientId } });
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
    },
  });

  revalidatePath(`/clients/${clientId}`);
  return null;
}

export async function deleteClientDocumentAction(documentId: string, clientId: string) {
  const { org } = await requireOrgContext();

  const document = await prisma.clientDocument.findUnique({
    where: { id: documentId },
    include: { client: true },
  });
  if (!document || document.client.orgId !== org.id || document.clientId !== clientId) {
    throw new Error("Document not found.");
  }

  await prisma.clientDocument.delete({ where: { id: documentId } });
  revalidatePath(`/clients/${clientId}`);
}
