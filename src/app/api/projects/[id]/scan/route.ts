import { prisma } from "@/lib/prisma";
import { requireOrgContext } from "@/lib/org-context";
import { runRepoScan, CodeHealthError } from "@/lib/services/code-health";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { org } = await requireOrgContext();
  const { id } = await params;

  const project = await prisma.project.findUnique({ where: { id }, include: { repo: true } });
  if (!project || project.orgId !== org.id) {
    return Response.json({ error: "Project not found." }, { status: 404 });
  }
  if (!project.repo) {
    return Response.json({ error: "No repo connected to this project." }, { status: 400 });
  }

  try {
    const result = await runRepoScan(project.repo.id);
    return Response.json(result);
  } catch (err) {
    if (err instanceof CodeHealthError) {
      return Response.json({ error: err.message }, { status: 502 });
    }
    throw err;
  }
}
