import { prisma } from "@/lib/prisma";
import { authenticateApiRequest, hideShareToken, unauthorized } from "@/lib/api-auth";
import { after } from "next/server";
import { clientSchema } from "@/lib/validations/client";
import { refreshWebsiteIcon } from "@/lib/services/client-logos";

const STATUSES = ["ACTIVE", "INACTIVE", "LEAD"] as const;

/** ?status=ACTIVE|INACTIVE|LEAD filters; LEAD is a draft client (from a
 * Cal.com/Calendly booking). Without it, every client, drafts included. */
export async function GET(req: Request) {
  const ctx = await authenticateApiRequest(req);
  if (!ctx) return unauthorized();

  const status = new URL(req.url).searchParams.get("status");
  if (status && !(STATUSES as readonly string[]).includes(status)) {
    return Response.json({ error: { status: ["Use ACTIVE, INACTIVE or LEAD."] } }, { status: 422 });
  }
  const clients = await prisma.client.findMany({
    where: { orgId: ctx.orgId, ...(status ? { status: status as (typeof STATUSES)[number] } : {}) },
    orderBy: { name: "asc" },
  });

  return Response.json({
    clients: clients.map((c) => ({ ...hideShareToken(c, ctx.role), draft: c.status === "LEAD" })),
  });
}

export async function POST(req: Request) {
  const ctx = await authenticateApiRequest(req);
  if (!ctx) return unauthorized();

  const body = await req.json().catch(() => null);
  const parsed = clientSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten().fieldErrors }, { status: 422 });
  }
  if (parsed.data.status === "LEAD") {
    return Response.json(
      { error: { status: ["Draft clients come from Cal.com and Calendly bookings. Use ACTIVE or INACTIVE."] } },
      { status: 422 }
    );
  }

  const client = await prisma.client.create({
    data: {
      orgId: ctx.orgId,
      name: parsed.data.name,
      website: parsed.data.website || null,
      description: parsed.data.description || null,
      email: parsed.data.email || null,
      phone: parsed.data.phone || null,
      address: parsed.data.address || null,
      requireClockTimes: parsed.data.requireClockTimes,
      invoiceTimeDetail: parsed.data.invoiceTimeDetail,
      attachInvoicePdf: parsed.data.attachInvoicePdf,
      status: parsed.data.status,
    },
  });
  // Its website's icon becomes the logo, fetched after the response.
  if (client.website) after(() => refreshWebsiteIcon(client.id));

  return Response.json({ client: hideShareToken(client, ctx.role) }, { status: 201 });
}
