import { render } from "@react-email/render";
import { requireOrgContext } from "@/lib/org-context";
import { buildDigest } from "@/lib/services/weekly-digest";
import { DigestEmail } from "@/emails/digest-email";

// What last week's digest email looks like, for owners and admins.
export async function GET() {
  const { org, role } = await requireOrgContext();
  if (role !== "OWNER" && role !== "ADMIN") return new Response("Not found", { status: 404 });
  const html = await render(DigestEmail(await buildDigest(org.id)));
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}
