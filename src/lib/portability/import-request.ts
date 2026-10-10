import "server-only";
import { requireOrgContext } from "@/lib/org-context";
import { MAX_IMPORT_BYTES } from "@/lib/portability/import-formats";
import { importOptionsSchema, type ImportOptions } from "@/lib/portability/import";

/** Sent by the import page; a cross-site form can't set it, and a
 * cross-site fetch that does is stopped by CORS preflight. */
export const IMPORT_REQUEST_HEADER = "x-consultainer-import";

const MB = 1024 * 1024;

function fail(status: number, error: string) {
  return Response.json({ error }, { status });
}

/** Auth (owners and admins), size limits and the form fields shared by the
 * import preview and run endpoints. Returns a Response on failure. */
export async function readImportRequest(req: Request): Promise<
  | Response
  | {
      ctx: Awaited<ReturnType<typeof requireOrgContext>>;
      text: string;
      fileName: string;
      options: ImportOptions;
    }
> {
  const ctx = await requireOrgContext();
  if (ctx.role !== "OWNER" && ctx.role !== "ADMIN") {
    return fail(403, "Only owners and admins can import data.");
  }
  if (req.headers.get(IMPORT_REQUEST_HEADER) !== "1") return fail(400, "Missing import header.");

  const length = Number(req.headers.get("content-length") ?? 0);
  if (length > MAX_IMPORT_BYTES + MB) {
    return fail(413, `That file is over ${MAX_IMPORT_BYTES / MB} MB. Export a shorter date range and import it in parts.`);
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return fail(400, "Couldn't read the upload. Try again.");
  }
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return fail(422, "Choose a CSV file to import.");
  if (file.size > MAX_IMPORT_BYTES) {
    return fail(413, `That file is over ${MAX_IMPORT_BYTES / MB} MB. Export a shorter date range and import it in parts.`);
  }
  if (/\.(xlsx?|numbers|pdf|zip)$/i.test(file.name)) {
    return fail(422, "That's not a CSV file. Export the report as CSV, not Excel or PDF.");
  }

  let raw: unknown = {};
  try {
    raw = JSON.parse(String(form.get("options") ?? "{}"));
  } catch {
    return fail(422, "Invalid import options.");
  }
  const parsed = importOptionsSchema.safeParse(raw);
  if (!parsed.success) return fail(422, "Invalid import options.");

  const text = (await file.text()).replace(/\u0000/g, "");
  return { ctx, text, fileName: file.name || "import.csv", options: parsed.data };
}
