import { revalidatePath } from "next/cache";
import { ImportError, runImport } from "@/lib/portability/import";
import { readImportRequest } from "@/lib/portability/import-request";

// Settings → Import, last step: imports the file with the options the
// preview showed (people mapping, column mapping, date format).
export async function POST(req: Request) {
  const input = await readImportRequest(req);
  if (input instanceof Response) return input;
  try {
    const result = await runImport(
      { orgId: input.ctx.org.id, actorId: input.ctx.user.id },
      input.text,
      input.fileName,
      input.options
    );
    revalidatePath("/settings/import");
    revalidatePath("/time");
    revalidatePath("/projects");
    revalidatePath("/clients");
    return Response.json({ result });
  } catch (err) {
    if (err instanceof ImportError) return Response.json({ error: err.message }, { status: 422 });
    throw err;
  }
}
