import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { twoFactorLoginTicketValid } from "@/lib/two-factor-ticket";
import { GoogleTwoFactorForm } from "./google-two-factor-form";

// The ticket is in the URL: don't hand it to anything this page links to.
export const metadata: Metadata = { referrer: "no-referrer" };
export const dynamic = "force-dynamic";

/** Second step of "Continue with Google" for accounts with an authenticator
 * app. Nobody is signed in yet — the session is only created once the code
 * checks out (lib/two-factor-ticket). */
export default async function GoogleTwoFactorPage({
  params,
}: {
  params: Promise<{ ticket: string }>;
}) {
  const { ticket } = await params;
  if (!(await twoFactorLoginTicketValid(ticket))) redirect("/login?error=two-factor-expired");
  return <GoogleTwoFactorForm ticket={ticket} />;
}
