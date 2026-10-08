import { prisma } from "@/lib/prisma";
import { authenticateApiRequest, unauthorized } from "@/lib/api-auth";
import { taskStatusValues } from "@/lib/validations/task";
import { pushTaskToLinear } from "@/lib/services/linear-sync";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await authenticateApiRequest(req);
  if (!ctx) return unauthorized();
  const { id } = await params;

  const task = await prisma.task.findUnique({ where: { id }, include: { project: true } });
  if (!task || task.project.orgId !== ctx.orgId) {
    return Response.json({ error: "Task not found." }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const data: { status?: (typeof taskStatusValues)[number]; assigneeId?: string | null } = {};

  if (body.status !== undefined) {
    if (!taskStatusValues.includes(body.status)) {
      return Response.json({ error: "Invalid status." }, { status: 422 });
    }
    data.status = body.status;
  }
  if (body.assigneeId !== undefined) {
    data.assigneeId = body.assigneeId || null;
  }

  const updated = await prisma.task.update({ where: { id }, data });
  await pushTaskToLinear(id);
  return Response.json({ task: updated });
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await authenticateApiRequest(req);
  if (!ctx) return unauthorized();
  const { id } = await params;

  const task = await prisma.task.findUnique({ where: { id }, include: { project: true } });
  if (!task || task.project.orgId !== ctx.orgId) {
    return Response.json({ error: "Task not found." }, { status: 404 });
  }

  await prisma.task.delete({ where: { id } });
  return Response.json({ ok: true });
}
