import { prisma } from "@/lib/prisma";
import { requireOrgContext } from "@/lib/org-context";
import { exportZipResponse } from "@/lib/portability/export-response";

// Settings → Export → one client's records as a ZIP (for handing them over).
// Owners and admins.
export async function GET(_req: Request, { params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  const { org, role, user } = await requireOrgContext();
  if (role !== "OWNER" && role !== "ADMIN") {
    return Response.json({ error: "Only owners and admins can export a client's records." }, { status: 403 });
  }
  const client = await prisma.client.findFirst({
    where: { id: clientId, orgId: org.id },
    select: { id: true, name: true },
  });
  if (!client) return Response.json({ error: "Client not found." }, { status: 404 });

  return exportZipResponse({
    scope: { orgId: org.id, clientId: client.id },
    orgName: org.name,
    orgSlug: org.slug,
    clientName: client.name,
    actor: { id: user.id, name: user.name, email: user.email },
  });
}
