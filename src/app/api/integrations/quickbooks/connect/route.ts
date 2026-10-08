import { NextResponse } from "next/server";
import { requireOrgContext } from "@/lib/org-context";
import { getAuthorizationUrl, signOAuthState, isQuickBooksConfigured } from "@/lib/integrations/quickbooks";
import { getRequestOrigin } from "@/lib/url";

export async function GET() {
  const { org, role } = await requireOrgContext();
  const origin = await getRequestOrigin();
  const back = (status: string) =>
    NextResponse.redirect(`${origin}/settings/integrations?quickbooks=${status}`);

  if (role !== "OWNER" && role !== "ADMIN") return back("forbidden");
  // Without the instance's OAuth app credentials there's nothing to redirect
  // to — send the admin back to the setup instructions instead of erroring.
  if (!(await isQuickBooksConfigured())) return back("not-configured");

  const redirectUri = `${origin}/api/integrations/quickbooks/callback`;
  return NextResponse.redirect(await getAuthorizationUrl(signOAuthState(org.id), redirectUri));
}
