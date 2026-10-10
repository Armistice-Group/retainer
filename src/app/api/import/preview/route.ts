import { ImportError, previewImport } from "@/lib/portability/import";
import { readImportRequest } from "@/lib/portability/import-request";

// Settings → Import, step 2: what importing this file would do. Writes nothing.
export async function POST(req: Request) {
  const input = await readImportRequest(req);
  if (input instanceof Response) return input;
  try {
    const preview = await previewImport(input.ctx.org.id, input.text, input.fileName, input.options);
    return Response.json({ preview });
  } catch (err) {
    if (err instanceof ImportError) return Response.json({ error: err.message }, { status: 422 });
    throw err;
  }
}
