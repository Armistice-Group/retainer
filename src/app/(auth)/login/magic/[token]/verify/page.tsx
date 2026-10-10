import type { Metadata } from "next";
import { MagicLinkCodeForm } from "./magic-link-code-form";

// The token is in the URL: don't hand it to anything this page links to.
export const metadata: Metadata = { referrer: "no-referrer" };

export default async function MagicLinkVerifyPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <MagicLinkCodeForm token={token} />;
}
