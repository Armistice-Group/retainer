import { requireOrgContext } from "@/lib/org-context";
import { exportZipResponse } from "@/lib/portability/export-response";

// Settings → Export → "Download everything": the whole organization as a
// ZIP, streamed. Owners only.
export async function GET() {
  const { org, role, user } = await requireOrgContext();
  if (role !== "OWNER") {
    return Response.json({ error: "Only owners can export the whole organization." }, { status: 403 });
  }
  return exportZipResponse({
    scope: { orgId: org.id },
    orgName: org.name,
    orgSlug: org.slug,
    actor: { id: user.id, name: user.name, email: user.email },
  });
}
