"use server";

import { revalidatePath } from "next/cache";
import { requireOrgContext } from "@/lib/org-context";
import { importClientsAndProjects, ImportError, type ImportSummary } from "@/lib/services/import";

export type ImportState = {
  error?: string;
  result?: ImportSummary;
} | null;

const MAX_FILE_BYTES = 2 * 1024 * 1024;

export async function importClientsAction(
  _prevState: ImportState,
  formData: FormData
): Promise<ImportState> {
  const { org, user } = await requireOrgContext();

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose a CSV file to import." };
  }
  if (file.size > MAX_FILE_BYTES) {
    return { error: "File must be under 2MB." };
  }

  const csvText = await file.text();

  try {
    const result = await importClientsAndProjects(
      { orgId: org.id, plan: org.plan, actorId: user.id, defaultCurrency: org.defaultCurrency },
      csvText
    );
    revalidatePath("/clients");
    revalidatePath("/projects");
    return { result };
  } catch (err) {
    if (err instanceof ImportError) return { error: err.message };
    throw err;
  }
}
