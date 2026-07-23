import { prisma } from "@/lib/prisma";
import { authenticateApiRequest, unauthorized } from "@/lib/api-auth";
import { timeEntrySchema } from "@/lib/validations/time-entry";
import { createTimeEntry, TimeEntryError } from "@/lib/services/time-entries";

export async function GET(req: Request) {
  const ctx = await authenticateApiRequest(req);
  if (!ctx) return unauthorized();

  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const projectId = searchParams.get("projectId") ?? undefined;
  const canManageTeam = ctx.role === "OWNER" || ctx.role === "ADMIN";
  const requestedUserId = searchParams.get("userId");
  const userId = canManageTeam && requestedUserId ? requestedUserId : ctx.actorId;

  const entries = await prisma.timeEntry.findMany({
    where: {
      orgId: ctx.orgId,
      userId,
      ...(projectId ? { projectId } : {}),
      ...(from || to
        ? {
            date: {
              ...(from ? { gte: new Date(from) } : {}),
              ...(to ? { lte: new Date(to) } : {}),
            },
          }
        : {}),
    },
    include: { project: { include: { client: true } }, task: true },
    orderBy: { date: "desc" },
  });

  return Response.json({ timeEntries: entries });
}

export async function POST(req: Request) {
  const ctx = await authenticateApiRequest(req);
  if (!ctx) return unauthorized();

  const body = await req.json().catch(() => null);
  const parsed = timeEntrySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten().fieldErrors }, { status: 422 });
  }

  try {
    const entry = await createTimeEntry(
      {
        orgId: ctx.orgId,
        slackWebhookUrl: ctx.slackWebhookUrl,
        actorId: ctx.actorId,
        actorName: ctx.actorName,
        role: ctx.role,
      },
      {
        projectId: parsed.data.projectId,
        taskId: parsed.data.taskId || null,
        date: parsed.data.date,
        hours: parsed.data.hours,
        description: parsed.data.description || null,
        billable: parsed.data.billable,
        userId: parsed.data.userId || null,
        rateOverride: parsed.data.rateOverride === "" ? null : (parsed.data.rateOverride ?? null),
      }
    );
    return Response.json({ timeEntry: entry }, { status: 201 });
  } catch (err) {
    if (err instanceof TimeEntryError) {
      return Response.json({ error: err.message }, { status: 422 });
    }
    throw err;
  }
}
