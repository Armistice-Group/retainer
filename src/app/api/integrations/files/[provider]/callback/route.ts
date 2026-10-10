import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { verifyUserOAuthState } from "@/lib/integrations/oauth-state";
import { PROVIDER_SLUGS, providerFor } from "@/lib/integrations/storage/registry";
import { tokenColumns } from "@/lib/integrations/storage/connections";
import { getRequestOrigin } from "@/lib/url";

// Finishes connecting a file service: only for the same signed-in person who
// started it (the state is signed and bound to them and the provider).
export async function GET(req: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider: slug } = await params;
  const origin = await getRequestOrigin();
  const back = (status: string) => NextResponse.redirect(`${origin}/profile?files=${status}#files`);

  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  if (searchParams.get("error")) return back("cancelled");
  if (!code || !state) return back("error");

  const id = PROVIDER_SLUGS[slug];
  const provider = id ? providerFor(id) : null;
  const verified = verifyUserOAuthState(state);
  const session = await auth();
  if (!provider || !verified || verified.provider !== provider.id || session?.user?.id !== verified.userId) {
    return back("error");
  }

  try {
    const redirectUri = `${origin}/api/integrations/files/${slug}/callback`;
    const tokens = await provider.exchangeCode(code, redirectUri);
    const account = await provider.account(tokens.accessToken).catch(() => ({ email: null, name: null }));
    const data = { ...tokenColumns(tokens), accountEmail: account.email, accountName: account.name };
    await prisma.userConnection.upsert({
      where: { userId_provider: { userId: verified.userId, provider: provider.id } },
      create: { userId: verified.userId, provider: provider.id, ...data },
      update: data,
    });
  } catch (err) {
    console.warn("[files] Connect failed", provider.id, err);
    return back("error");
  }
  return back("connected");
}
