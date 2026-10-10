import { prisma } from "@/lib/prisma";
import { authenticateApiRequest, unauthorized, type ApiAuthContext } from "@/lib/api-auth";
import { taskStatusValues, optionalDueDate, dueDateValue } from "@/lib/validations/task";
import { dueDateData } from "@/lib/services/deadlines";
import { pushTaskToLinear } from "@/lib/services/linear-sync";
import { canAssignOnProject, canViewProject } from "@/lib/project-access";
import { notify } from "@/lib/notifications";

/** The task, if it's in the org and on a project the key's owner can see
 * (same rule as the web task actions and the MCP task tools). */
async function findTaskForActor(id: string, ctx: ApiAuthContext) {
  const task = await prisma.task.findUnique({ where: { id }, include: { project: true } });
  if (!task || task.project.orgId !== ctx.orgId) return null;
  if (!(await canViewProject(task.project, ctx.actorId, ctx.role))) return null;
  return task;
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await authenticateApiRequest(req);
  if (!ctx) return unauthorized();
  const { id } = await params;

  const task = await findTaskForActor(id, ctx);
  if (!task) return Response.json({ error: "Task not found." }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const data: {
    status?: (typeof taskStatusValues)[number];
    assigneeId?: string | null;
    dueDate?: Date | null;
    dueSoonNotifiedAt?: null;
    overdueNotifiedAt?: null;
  } = {};

  if (body.status !== undefined) {
    if (!taskStatusValues.includes(body.status)) {
      return Response.json({ error: "Invalid status." }, { status: 422 });
    }
    data.status = body.status;
  }
  if (body.assigneeId !== undefined) {
    if (body.assigneeId !== null && typeof body.assigneeId !== "string") {
      return Response.json({ error: "Invalid assigneeId." }, { status: 422 });
    }
    if (body.assigneeId && !(await canAssignOnProject(task.project, body.assigneeId))) {
      return Response.json(
        { error: "That person can't be assigned tasks on this project." },
        { status: 422 }
      );
    }
    data.assigneeId = body.assigneeId || null;
  }
  if (body.dueDate !== undefined) {
    // "YYYY-MM-DD", or null to clear it.
    const due = optionalDueDate.safeParse(body.dueDate);
    if (!due.success) {
      return Response.json({ error: { dueDate: due.error.issues.map((i) => i.message) } }, { status: 422 });
    }
    Object.assign(data, dueDateData(task.dueDate, dueDateValue(due.data) ?? null));
  }

  const updated = await prisma.task.update({ where: { id }, data });
  await pushTaskToLinear(id);

  if (
    updated.assigneeId &&
    updated.assigneeId !== task.assigneeId &&
    updated.assigneeId !== ctx.actorId
  ) {
    await notify(prisma, {
      orgId: ctx.orgId,
      userIds: [updated.assigneeId],
      type: "TASK_ASSIGNED",
      message: `You were assigned "${updated.title}" on ${task.project.name}.`,
      link: `/projects/${task.projectId}?task=${updated.id}`,
    });
  }
  return Response.json({ task: updated });
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await authenticateApiRequest(req);
  if (!ctx) return unauthorized();
  const { id } = await params;

  const task = await findTaskForActor(id, ctx);
  if (!task) return Response.json({ error: "Task not found." }, { status: 404 });

  await prisma.task.delete({ where: { id } });
  return Response.json({ ok: true });
}
