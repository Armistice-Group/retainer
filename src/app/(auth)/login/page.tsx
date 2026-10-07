import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { isSetupComplete } from "@/lib/setup";
import { isEmailConfigured } from "@/lib/email";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; error?: string }>;
}) {
  if (!(await isSetupComplete())) redirect("/setup");

  const { callbackUrl, error } = await searchParams;
  const errorMessages: Record<string, string> = {
    "invalid-magic-link": "That login link is invalid or has expired.",
    "sso-failed": "SSO sign-in failed. Try again or contact your admin.",
    "sso-domain-not-allowed": "Your email domain isn't allowed to sign in with this SSO provider.",
    "sso-no-account": "You don't have an account yet. Ask an admin to invite you.",
    "sso-required": "Your organization requires signing in with SSO.",
    "no-account": "There's no account for that email. Ask an admin to invite you.",
    "email-verification-expired": "That email confirmation link is invalid or has expired.",
    "email-already-taken": "That email is now used by another account.",
  };

  const ssoConnections = await prisma.ssoConnection.findMany({
    where: { enabled: true },
    select: { id: true, displayName: true, org: { select: { name: true } } },
    orderBy: { createdAt: "asc" },
  });

  return (
    <LoginForm
      callbackUrl={callbackUrl || "/dashboard"}
      googleEnabled={!!process.env.AUTH_GOOGLE_ID}
      magicLinkEnabled={isEmailConfigured()}
      ssoProviders={ssoConnections.map((c) => ({
        id: c.id,
        // With one org on the instance the org name adds nothing; with
        // several, it disambiguates two providers that share a label.
        label:
          ssoConnections.length > 1
            ? `${c.displayName || "SSO"} (${c.org.name})`
            : c.displayName || "SSO",
      }))}
      initialError={error ? errorMessages[error] : undefined}
    />
  );
}
