import { LoginForm } from "./login-form";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; error?: string }>;
}) {
  const { callbackUrl, error } = await searchParams;
  const errorMessages: Record<string, string> = {
    "invalid-magic-link": "That login link is invalid or has expired.",
    "sso-failed": "SSO sign-in failed. Try again or contact your admin.",
    "account-exists": "An account with that email already exists. Log in instead.",
    "email-verification-expired": "That email confirmation link is invalid or has expired.",
    "email-already-taken": "That email is now used by another account.",
  };
  return (
    <LoginForm
      callbackUrl={callbackUrl || "/dashboard"}
      googleEnabled={!!process.env.AUTH_GOOGLE_ID}
      initialError={error ? errorMessages[error] : undefined}
    />
  );
}
