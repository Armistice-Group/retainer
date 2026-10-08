import { prisma } from "@/lib/prisma";
import { authenticateApiRequest, unauthorized } from "@/lib/api-auth";
import { canViewProject } from "@/lib/project-access";
import { taskSchema } from "@/lib/validations/task";
import { notify } from "@/lib/notifications";
import { soloMemberId } from "@/lib/org";
import { pushTaskToLinear } from "@/lib/services/linear-sync";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await authenticateApiRequest(req);
  if (!ctx) return unauthorized();
  const { id } = await params;

  const project = await prisma.project.findUnique({ where: { id } });
  if (!project || project.orgId !== ctx.orgId) {
    return Response.json({ error: "Project not found." }, { status: 404 });
  }
  if (!(await canViewProject(project, ctx.actorId, ctx.role))) {
    return Response.json({ error: "Project not found." }, { status: 404 });
  }

  const tasks = await prisma.task.findMany({
    where: { projectId: id },
    include: { assignee: { select: { id: true, name: true } } },
    orderBy: { createdAt: "desc" },
  });

  return Response.json({ tasks });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await authenticateApiRequest(req);
  if (!ctx) return unauthorized();
  const { id } = await params;

  const project = await prisma.project.findUnique({ where: { id } });
  if (!project || project.orgId !== ctx.orgId) {
    return Response.json({ error: "Project not found." }, { status: 404 });
  }
  if (!(await canViewProject(project, ctx.actorId, ctx.role))) {
    return Response.json({ error: "Project not found." }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  const parsed = taskSchema.safeParse({ ...body, projectId: id });
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten().fieldErrors }, { status: 422 });
  }

  const task = await prisma.task.create({
    data: {
      projectId: id,
      title: parsed.data.title,
      description: parsed.data.description || null,
      assigneeId: parsed.data.assigneeId || (await soloMemberId(ctx.orgId)),
    },
  });
  await pushTaskToLinear(task.id);

  if (task.assigneeId && task.assigneeId !== ctx.actorId) {
    await notify(prisma, {
      orgId: ctx.orgId,
      userIds: [task.assigneeId],
      type: "TASK_ASSIGNED",
      message: `You were assigned "${task.title}" on ${project.name}.`,
      link: `/projects/${project.id}?task=${task.id}`,
    });
  }

  return Response.json({ task }, { status: 201 });
}
