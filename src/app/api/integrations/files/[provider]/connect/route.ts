import { NextResponse } from "next/server";
import { requireOrgContext } from "@/lib/org-context";
import { signUserOAuthState } from "@/lib/integrations/oauth-state";
import { PROVIDER_SLUGS, providerFor } from "@/lib/integrations/storage/registry";
import { getRequestOrigin } from "@/lib/url";

// Starts connecting one of the signed-in person's file services.
export async function GET(_req: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider: slug } = await params;
  const { user } = await requireOrgContext();
  const origin = await getRequestOrigin();
  const id = PROVIDER_SLUGS[slug];
  const provider = id ? providerFor(id) : null;
  const back = (status: string) => NextResponse.redirect(`${origin}/profile?files=${status}#files`);
  if (!provider) return back("unknown");
  if (!(await provider.configured())) return back("not-configured");
  const redirectUri = `${origin}/api/integrations/files/${slug}/callback`;
  return NextResponse.redirect(await provider.authorizeUrl(signUserOAuthState(user.id, provider.id), redirectUri));
}
