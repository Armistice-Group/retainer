import { authenticateApiRequest, unauthorized } from "@/lib/api-auth";
import { listBookings } from "@/lib/services/scheduling";

const STATUSES = ["SCHEDULED", "CANCELLED", "RESCHEDULED", "NO_SHOW"] as const;

/** Cal.com/Calendly bookings: owners and admins get the organization's,
 * others the ones they host. ?from, ?to (ISO dates, by start), ?clientId,
 * ?status. */
export async function GET(req: Request) {
  const ctx = await authenticateApiRequest(req);
  if (!ctx) return unauthorized();

  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const status = searchParams.get("status");
  const invalid: Record<string, string[]> = {};
  for (const [key, value] of [
    ["from", from],
    ["to", to],
  ] as const) {
    if (value && Number.isNaN(new Date(value).getTime())) invalid[key] = ["Use an ISO date, e.g. 2026-07-23."];
  }
  if (status && !(STATUSES as readonly string[]).includes(status)) {
    invalid.status = ["Use SCHEDULED, CANCELLED, RESCHEDULED or NO_SHOW."];
  }
  if (Object.keys(invalid).length) return Response.json({ error: invalid }, { status: 422 });

  const bookings = await listBookings(
    { orgId: ctx.orgId, userId: ctx.actorId, role: ctx.role },
    {
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
      clientId: searchParams.get("clientId") ?? undefined,
      status: (status as (typeof STATUSES)[number]) ?? undefined,
      limit: 500,
    }
  );
  return Response.json({
    bookings: bookings.map((b) => ({
      id: b.id,
      provider: b.provider,
      title: b.title,
      eventType: b.eventTypeName,
      startAt: b.startAt,
      endAt: b.endAt,
      status: b.status,
      invitee: { name: b.inviteeName, email: b.inviteeEmail, phone: b.inviteePhone, timeZone: b.timeZone },
      client: b.client ? { id: b.client.id, name: b.client.name, draft: b.client.status === "LEAD" } : null,
      joinUrl: b.joinUrl,
      location: b.location,
      answers: b.answers,
    })),
  });
}
