import { prisma } from "@/lib/prisma";
import { authenticateApiRequest, hideShareToken, unauthorized } from "@/lib/api-auth";
import { projectVisibilityWhere } from "@/lib/project-access";

export async function GET(req: Request) {
  const ctx = await authenticateApiRequest(req);
  if (!ctx) return unauthorized();

  const { searchParams } = new URL(req.url);
  const clientId = searchParams.get("clientId") ?? undefined;

  const projects = await prisma.project.findMany({
    where: {
      orgId: ctx.orgId,
      ...(clientId ? { clientId } : {}),
      ...projectVisibilityWhere(ctx.actorId, ctx.role),
    },
    include: { client: { select: { id: true, name: true } } },
    orderBy: { createdAt: "desc" },
  });

  return Response.json({ projects: projects.map((p) => hideShareToken(p, ctx.role)) });
}
