"use server";

import { revalidatePath } from "next/cache";
import { requireOrgContext } from "@/lib/org-context";
import {
  addLinkedDocument,
  addUploadedDocument,
  deleteDocument,
  DocumentError,
  refreshLinkedDocument,
  updateDocumentSharing,
  type DocumentContext,
  type DocumentMeta,
} from "@/lib/services/documents";
import type { ActionState } from "@/actions/auth";
import type { ClientDocumentType, DocumentAccess, DocumentAudience } from "@/generated/prisma/client";

const TYPES = new Set(["W9", "FORM_1099", "CONTRACT", "NDA", "SOW", "PROPOSAL", "REPORT", "REFERENCE", "OTHER"]);

async function context(): Promise<DocumentContext> {
  const { org, user, role } = await requireOrgContext();
  return { orgId: org.id, actorId: user.id, role };
}

function revalidate(clientId: string, projectId?: string | null) {
  revalidatePath(`/clients/${clientId}`);
  if (projectId) revalidatePath(`/projects/${projectId}`);
}

function sharing(formData: FormData) {
  const access = String(formData.get("access") ?? "EVERYONE");
  const audience = String(formData.get("audience") ?? "INTERNAL");
  return {
    access: (["EVERYONE", "ADMINS", "SELECTED"].includes(access) ? access : "EVERYONE") as DocumentAccess,
    allowedUserIds: formData.getAll("allowedUserIds").map(String),
    audience: (audience === "CLIENT" ? "CLIENT" : "INTERNAL") as DocumentAudience,
  };
}

function meta(clientId: string, formData: FormData): DocumentMeta {
  const type = String(formData.get("type") ?? "OTHER");
  return {
    clientId,
    // " " is the picker's "Whole client" option.
    projectId: String(formData.get("projectId") ?? "").trim() || null,
    type: (TYPES.has(type) ? type : "OTHER") as ClientDocumentType,
    label: ((formData.get("label") as string | null) ?? "").slice(0, 150),
    ...sharing(formData),
  };
}

/** Upload a file, or (with `url`) link one from where it lives. */
export async function addClientDocumentAction(
  clientId: string,
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const ctx = await context();
  const m = meta(clientId, formData);
  try {
    const url = String(formData.get("url") ?? "").trim();
    if (url) {
      await addLinkedDocument(ctx, m, url);
    } else {
      const file = formData.get("file");
      if (!(file instanceof File)) return { error: "Choose a file, or paste a link." };
      await addUploadedDocument(ctx, m, file);
    }
  } catch (err) {
    if (err instanceof DocumentError) return { error: err.message };
    throw err;
  }
  revalidate(clientId, m.projectId);
  return { saved: true };
}

export async function deleteClientDocumentAction(documentId: string, clientId: string) {
  const doc = await deleteDocument(await context(), documentId);
  revalidate(clientId, doc.projectId);
}

export async function setDocumentSharingAction(
  documentId: string,
  clientId: string,
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  try {
    const doc = await updateDocumentSharing(await context(), documentId, sharing(formData));
    revalidate(clientId, doc.projectId);
    revalidatePath(`/clients/${clientId}/documents/${documentId}`);
  } catch (err) {
    if (err instanceof DocumentError) return { error: err.message };
    throw err;
  }
  return { saved: true };
}

export async function refreshLinkedDocumentAction(documentId: string, clientId: string) {
  const doc = await refreshLinkedDocument(await context(), documentId);
  revalidate(clientId, doc.projectId);
}
