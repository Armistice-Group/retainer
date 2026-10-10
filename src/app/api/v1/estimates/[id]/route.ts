import { prisma } from "@/lib/prisma";
import { authenticateApiRequest, unauthorized } from "@/lib/api-auth";
import {
  estimateForApi,
  expireEstimates,
  visibleEstimateWhere,
} from "@/lib/services/estimates";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await authenticateApiRequest(req);
  if (!ctx) return unauthorized();
  const { id } = await params;

  await expireEstimates({ orgId: ctx.orgId, estimateId: id });
  const estimate = await prisma.estimate.findFirst({
    where: visibleEstimateWhere({ orgId: ctx.orgId, actorId: ctx.actorId, role: ctx.role }, id),
    include: {
      client: { select: { id: true, name: true } },
      project: { select: { id: true, name: true } },
      lineItems: { orderBy: { sortOrder: "asc" } },
    },
  });
  if (!estimate) return Response.json({ error: "Estimate not found." }, { status: 404 });

  return Response.json({ estimate: estimateForApi(estimate, ctx.role) });
}
