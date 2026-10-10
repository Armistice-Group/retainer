import { authenticateApiRequest, unauthorized } from "@/lib/api-auth";
import { listVaultLinks, vaultLinkJson, VaultLinkError } from "@/lib/services/vault-links";

// GET /api/v1/clients/:id/vault-links — links to password-manager items
// (1Password, Bitwarden, …) on this client, plus those on its projects the
// key's user can see. ?projectId= narrows to that one project's links. Only
// links, labels and notes — Consultainer never stores the secrets.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await authenticateApiRequest(req);
  if (!ctx) return unauthorized();
  const { id } = await params;
  const projectId = new URL(req.url).searchParams.get("projectId") || undefined;
  try {
    const links = await listVaultLinks(
      { orgId: ctx.orgId, userId: ctx.actorId, role: ctx.role },
      { clientId: id, projectId }
    );
    return Response.json({ vaultLinks: links.map(vaultLinkJson) });
  } catch (err) {
    if (err instanceof VaultLinkError) return Response.json({ error: err.message }, { status: 404 });
    throw err;
  }
}
