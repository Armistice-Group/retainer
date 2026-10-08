import { authenticateApiRequest, unauthorized } from "@/lib/api-auth";
import { taskCommentSchema } from "@/lib/validations/task";
import {
  addTaskComment,
  listTaskComments,
  TaskCommentError,
} from "@/lib/services/task-comments";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await authenticateApiRequest(req);
  if (!ctx) return unauthorized();
  const { id } = await params;

  try {
    return Response.json({ comments: await listTaskComments(ctx, id) });
  } catch (err) {
    if (err instanceof TaskCommentError) {
      return Response.json({ error: err.message }, { status: 404 });
    }
    throw err;
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await authenticateApiRequest(req);
  if (!ctx) return unauthorized();
  const { id } = await params;

  const body = await req.json().catch(() => ({}));
  // Same default as the app: on a Linear-linked task the comment goes to
  // Linear too unless the caller opts out.
  const parsed = taskCommentSchema.safeParse({
    body: body.body,
    postToLinear: body.postToLinear ?? true,
  });
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten().fieldErrors }, { status: 422 });
  }

  try {
    const { comment } = await addTaskComment(ctx, id, parsed.data);
    return Response.json({ comment }, { status: 201 });
  } catch (err) {
    if (err instanceof TaskCommentError) {
      return Response.json({ error: err.message }, { status: 404 });
    }
    throw err;
  }
}
