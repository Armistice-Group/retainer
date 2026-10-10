import { prisma } from "@/lib/prisma";
import { authenticateApiRequest, unauthorized } from "@/lib/api-auth";
import { invoiceVisibilityWhere } from "@/lib/project-access";

const STATUSES = ["DRAFT", "SENT", "PAID", "VOID"] as const;

export async function GET(req: Request) {
  const ctx = await authenticateApiRequest(req);
  if (!ctx) return unauthorized();

  const { searchParams } = new URL(req.url);
  const statusParam = searchParams.get("status");
  const status = STATUSES.find((s) => s === statusParam);

  const invoices = await prisma.invoice.findMany({
    where: {
      orgId: ctx.orgId,
      ...(status ? { status } : {}),
      ...invoiceVisibilityWhere(ctx.actorId, ctx.role),
    },
    include: { client: { select: { id: true, name: true } } },
    orderBy: { createdAt: "desc" },
  });

  return Response.json({ invoices });
}
