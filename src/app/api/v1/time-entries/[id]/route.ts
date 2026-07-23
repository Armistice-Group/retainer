import { authenticateApiRequest, unauthorized } from "@/lib/api-auth";
import { timeEntrySchema } from "@/lib/validations/time-entry";
import { updateTimeEntry, deleteTimeEntry, TimeEntryError } from "@/lib/services/time-entries";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await authenticateApiRequest(req);
  if (!ctx) return unauthorized();
  const { id } = await params;

  const body = await req.json().catch(() => null);
  const parsed = timeEntrySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten().fieldErrors }, { status: 422 });
  }

  try {
    const entry = await updateTimeEntry(
      {
        orgId: ctx.orgId,
        slackWebhookUrl: ctx.slackWebhookUrl,
        actorId: ctx.actorId,
        actorName: ctx.actorName,
        role: ctx.role,
      },
      id,
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
    return Response.json({ timeEntry: entry });
  } catch (err) {
    if (err instanceof TimeEntryError) {
      return Response.json({ error: err.message }, { status: 422 });
    }
    throw err;
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await authenticateApiRequest(req);
  if (!ctx) return unauthorized();
  const { id } = await params;

  try {
    await deleteTimeEntry(
      {
        orgId: ctx.orgId,
        slackWebhookUrl: ctx.slackWebhookUrl,
        actorId: ctx.actorId,
        actorName: ctx.actorName,
        role: ctx.role,
      },
      id
    );
    return Response.json({ ok: true });
  } catch (err) {
    if (err instanceof TimeEntryError) {
      return Response.json({ error: err.message }, { status: 422 });
    }
    throw err;
  }
}
