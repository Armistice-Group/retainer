import { NextResponse } from "next/server";
import { requireOrgContext } from "@/lib/org-context";
import { signOAuthState } from "@/lib/integrations/oauth-state";
import { docuSignAuthorizationUrl, isDocuSignConfigured } from "@/lib/integrations/agreements/providers";
import { getRequestOrigin } from "@/lib/url";

export async function GET() {
  const { org, role } = await requireOrgContext();
  const origin = await getRequestOrigin();
  const back = (status: string) => NextResponse.redirect(`${origin}/settings/agreements?docusign=${status}`);

  if (role !== "OWNER" && role !== "ADMIN") return back("forbidden");
  if (!(await isDocuSignConfigured())) return back("not-configured");

  const redirectUri = `${origin}/api/integrations/docusign/callback`;
  return NextResponse.redirect(await docuSignAuthorizationUrl(signOAuthState(org.id), redirectUri));
}
