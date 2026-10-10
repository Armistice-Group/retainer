import { prisma } from "@/lib/prisma";
import { authenticateApiRequest, unauthorized } from "@/lib/api-auth";
import { visibleAgreements } from "@/lib/services/agreements";

// GET /api/v1/clients/:id/agreements — the client's signed agreements
// (DocuSign, Documenso, Ironclad), including its projects' ones the key's
// user can see. ?projectId= narrows to one project.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await authenticateApiRequest(req);
  if (!ctx) return unauthorized();
  const { id } = await params;

  const client = await prisma.client.findUnique({ where: { id }, select: { orgId: true } });
  if (!client || client.orgId !== ctx.orgId) {
    return Response.json({ error: "Client not found." }, { status: 404 });
  }
  const projectId = new URL(req.url).searchParams.get("projectId") || undefined;
  const agreements = await visibleAgreements(
    { orgId: ctx.orgId, userId: ctx.actorId, role: ctx.role },
    { clientId: id, projectId }
  );
  return Response.json({
    agreements: agreements.map((a) => ({
      id: a.id,
      provider: a.provider,
      title: a.title,
      status: a.status,
      signedAt: a.signedAt,
      signers: a.signers,
      projectId: a.projectId,
      projectName: a.projectName,
      url: a.externalUrl,
      hasSignedCopy: a.hasFile,
    })),
  });
}
