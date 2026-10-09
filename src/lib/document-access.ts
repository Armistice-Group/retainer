import type { DocumentAccess, Prisma, Role } from "@/generated/prisma/client";

/** Who can open a client document:
 * - owners, and whoever uploaded it, always;
 * - EVERYONE: any member of the org;
 * - ADMINS: owners and admins;
 * - SELECTED: only the people in allowedUserIds. */
export function canViewDocument(
  doc: { access: DocumentAccess; allowedUserIds: string[]; uploadedById: string | null },
  userId: string,
  role: Role
) {
  if (role === "OWNER" || doc.uploadedById === userId) return true;
  if (doc.access === "EVERYONE") return true;
  if (doc.access === "ADMINS") return role === "ADMIN";
  return doc.allowedUserIds.includes(userId);
}

/** Who can change a document's access or delete it: owners, the uploader,
 * and admins who can see it. */
export function canManageDocument(
  doc: { access: DocumentAccess; allowedUserIds: string[]; uploadedById: string | null },
  userId: string,
  role: Role
) {
  if (role === "OWNER" || doc.uploadedById === userId) return true;
  return role === "ADMIN" && canViewDocument(doc, userId, role);
}

/** The same rule as a `where` for clientDocument queries. */
export function documentVisibilityWhere(userId: string, role: Role): Prisma.ClientDocumentWhereInput {
  if (role === "OWNER") return {};
  return {
    OR: [
      { uploadedById: userId },
      { access: "EVERYONE" },
      ...(role === "ADMIN" ? [{ access: "ADMINS" as const }] : []),
      { access: "SELECTED", allowedUserIds: { has: userId } },
    ],
  };
}

export const DOCUMENT_ACCESS_LABELS: Record<DocumentAccess, string> = {
  EVERYONE: "Everyone",
  ADMINS: "Owners & admins",
  SELECTED: "Specific people",
};
