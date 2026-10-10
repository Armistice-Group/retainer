import { prisma } from "@/lib/prisma";
import { authenticateApiRequest, forbidden, unauthorized } from "@/lib/api-auth";
import { estimateInputSchema } from "@/lib/validations/estimate";
import {
  canManageEstimates,
  createEstimate,
  estimateForApi,
  estimateVisibilityWhere,
  EstimateError,
  ESTIMATE_STATUSES,
  expireEstimates,
} from "@/lib/services/estimates";

export async function GET(req: Request) {
  const ctx = await authenticateApiRequest(req);
  if (!ctx) return unauthorized();

  const { searchParams } = new URL(req.url);
  const status = ESTIMATE_STATUSES.find((s) => s === searchParams.get("status"));
  const clientId = searchParams.get("clientId");

  await expireEstimates({ orgId: ctx.orgId });
  const estimates = await prisma.estimate.findMany({
    where: {
      orgId: ctx.orgId,
      ...(status ? { status } : {}),
      ...(clientId ? { clientId } : {}),
      ...estimateVisibilityWhere(ctx.actorId, ctx.role),
    },
    include: { client: { select: { id: true, name: true } } },
    orderBy: { createdAt: "desc" },
  });

  return Response.json({ estimates: estimates.map((e) => estimateForApi(e, ctx.role)) });
}

export async function POST(req: Request) {
  const ctx = await authenticateApiRequest(req);
  if (!ctx) return unauthorized();
  if (!canManageEstimates(ctx.role)) return forbidden("Only owners and admins can manage estimates.");

  const body = await req.json().catch(() => null);
  const parsed = estimateInputSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten().fieldErrors }, { status: 422 });
  }

  try {
    const estimate = await createEstimate(
      { orgId: ctx.orgId, actorId: ctx.actorId, role: ctx.role },
      parsed.data
    );
    return Response.json({ estimate: estimateForApi(estimate, ctx.role) }, { status: 201 });
  } catch (err) {
    if (err instanceof EstimateError) return Response.json({ error: err.message }, { status: 422 });
    throw err;
  }
}
