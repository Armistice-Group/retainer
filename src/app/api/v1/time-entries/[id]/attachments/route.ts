import { authenticateApiRequest, unauthorized } from "@/lib/api-auth";
import {
  addAttachments,
  AttachmentError,
  listEntryAttachments,
} from "@/lib/services/time-entry-attachments";

function context(ctx: NonNullable<Awaited<ReturnType<typeof authenticateApiRequest>>>) {
  return { orgId: ctx.orgId, actorId: ctx.actorId, role: ctx.role };
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await authenticateApiRequest(req);
  if (!ctx) return unauthorized();
  const { id } = await params;
  const attachments = await listEntryAttachments(context(ctx), id);
  if (!attachments) return Response.json({ error: "Time entry not found." }, { status: 404 });
  return Response.json({ attachments });
}

/** multipart/form-data: one or more "file" parts, and clientVisible=true to
 * show them on the invoice's time detail. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await authenticateApiRequest(req);
  if (!ctx) return unauthorized();
  const { id } = await params;

  const form = await req.formData().catch(() => null);
  if (!form) {
    return Response.json({ error: "Send multipart/form-data with one or more \"file\" parts." }, { status: 422 });
  }
  const files = form.getAll("file").filter((f): f is File => f instanceof File);
  try {
    const attachments = await addAttachments(context(ctx), id, files, {
      clientVisible: form.get("clientVisible") === "true",
    });
    return Response.json({ attachments }, { status: 201 });
  } catch (err) {
    if (err instanceof AttachmentError) {
      const status = err.message === "Entry not found." ? 404 : /^You can only/.test(err.message) ? 403 : 422;
      return Response.json({ error: err.message }, { status });
    }
    throw err;
  }
}
