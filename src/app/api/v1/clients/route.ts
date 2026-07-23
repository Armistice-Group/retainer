import { prisma } from "@/lib/prisma";
import { authenticateApiRequest, unauthorized } from "@/lib/api-auth";
import { clientSchema } from "@/lib/validations/client";

export async function GET(req: Request) {
  const ctx = await authenticateApiRequest(req);
  if (!ctx) return unauthorized();

  const clients = await prisma.client.findMany({
    where: { orgId: ctx.orgId },
    orderBy: { name: "asc" },
  });

  return Response.json({ clients });
}

export async function POST(req: Request) {
  const ctx = await authenticateApiRequest(req);
  if (!ctx) return unauthorized();

  const body = await req.json().catch(() => null);
  const parsed = clientSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten().fieldErrors }, { status: 422 });
  }

  const client = await prisma.client.create({
    data: {
      orgId: ctx.orgId,
      name: parsed.data.name,
      description: parsed.data.description || null,
      email: parsed.data.email || null,
      phone: parsed.data.phone || null,
      address: parsed.data.address || null,
      status: parsed.data.status,
    },
  });

  return Response.json({ client }, { status: 201 });
}
