import { NextResponse } from "next/server";
import { requireOrgContext, requireRole } from "@/lib/org-context";
import { getAuthorizationUrl, signOAuthState } from "@/lib/integrations/github";
import { getOrigin } from "@/lib/url";

export async function GET() {
  const { org, role } = await requireOrgContext();
  requireRole(role, ["OWNER", "ADMIN"]);

  const origin = await getOrigin();
  const redirectUri = `${origin}/api/integrations/github/callback`;
  const state = signOAuthState(org.id);

  return NextResponse.redirect(getAuthorizationUrl(state, redirectUri));
}
