import { authenticateApiRequest, unauthorized } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { deleteTaskComment, TaskCommentError } from "@/lib/services/task-comments";

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string; commentId: string }> }
) {
  const ctx = await authenticateApiRequest(req);
  if (!ctx) return unauthorized();
  const { id, commentId } = await params;

  const comment = await prisma.taskComment.findUnique({ where: { id: commentId } });
  if (!comment || comment.taskId !== id) {
    return Response.json({ error: "Comment not found." }, { status: 404 });
  }

  try {
    await deleteTaskComment(ctx, commentId);
    return Response.json({ ok: true });
  } catch (err) {
    if (err instanceof TaskCommentError) {
      return Response.json(
        { error: err.message },
        { status: err.code === "forbidden" ? 403 : 404 }
      );
    }
    throw err;
  }
}
