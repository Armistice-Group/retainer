import { NextResponse } from "next/server";
import { requireOrgContext } from "@/lib/org-context";
import { getAuthorizationUrl, signOAuthState, isLinearConfigured } from "@/lib/integrations/linear";
import { getRequestOrigin } from "@/lib/url";

export async function GET() {
  const { org, role } = await requireOrgContext();
  const origin = await getRequestOrigin();
  const back = (status: string) =>
    NextResponse.redirect(`${origin}/settings/integrations?linear=${status}`);

  if (role !== "OWNER" && role !== "ADMIN") return back("forbidden");
  // Without the instance's OAuth app credentials there's nothing to redirect
  // to — send the admin back to the setup instructions instead of erroring.
  if (!isLinearConfigured()) return back("not-configured");

  const redirectUri = `${origin}/api/integrations/linear/callback`;
  return NextResponse.redirect(getAuthorizationUrl(signOAuthState(org.id), redirectUri));
}
