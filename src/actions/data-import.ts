"use server";

import { revalidatePath } from "next/cache";
import { requireOrgContext, requireRole } from "@/lib/org-context";
import { ImportError, undoImport } from "@/lib/portability/import";

export type UndoImportState = { error?: string; message?: string } | null;

export async function undoImportAction(
  _prev: UndoImportState,
  formData: FormData
): Promise<UndoImportState> {
  const { org, user, role } = await requireOrgContext();
  requireRole(role, ["OWNER", "ADMIN"]);
  const batchId = String(formData.get("batchId") ?? "");
  try {
    const r = await undoImport({ orgId: org.id, actorId: user.id }, batchId);
    revalidatePath("/settings/import");
    revalidatePath("/time");
    revalidatePath("/projects");
    revalidatePath("/clients");
    const kept =
      r.projectsKept + r.clientsKept > 0
        ? ` Kept ${r.projectsKept} project${r.projectsKept === 1 ? "" : "s"} and ${r.clientsKept} client${r.clientsKept === 1 ? "" : "s"} that have other records now.`
        : "";
    return {
      message: `Removed ${r.entriesDeleted} time entr${r.entriesDeleted === 1 ? "y" : "ies"}, ${r.projectsDeleted} project${r.projectsDeleted === 1 ? "" : "s"} and ${r.clientsDeleted} client${r.clientsDeleted === 1 ? "" : "s"}.${kept}`,
    };
  } catch (err) {
    if (err instanceof ImportError) return { error: err.message };
    throw err;
  }
}
