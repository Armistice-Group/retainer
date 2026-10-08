import { NextResponse } from "next/server";
import { requireOrgContext, requireRole } from "@/lib/org-context";
import { getAuthorizationUrl, signOAuthState } from "@/lib/integrations/linear";
import { getRequestOrigin } from "@/lib/url";

export async function GET() {
  const { org, role } = await requireOrgContext();
  requireRole(role, ["OWNER", "ADMIN"]);

  const origin = await getRequestOrigin();
  const redirectUri = `${origin}/api/integrations/linear/callback`;
  const state = signOAuthState(org.id);

  return NextResponse.redirect(getAuthorizationUrl(state, redirectUri));
}
