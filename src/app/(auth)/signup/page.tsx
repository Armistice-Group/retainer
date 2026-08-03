import { SignupForm } from "./signup-form";

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const initialError =
    error === "verification-expired"
      ? "That confirmation link is invalid or has expired. Sign up again."
      : undefined;

  return <SignupForm googleEnabled={!!process.env.AUTH_GOOGLE_ID} initialError={initialError} />;
}
