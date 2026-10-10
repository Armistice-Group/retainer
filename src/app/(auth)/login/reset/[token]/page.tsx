import type { Metadata } from "next";
import Link from "next/link";
import { findValidResetToken } from "@/lib/password-reset";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ResetPasswordForm } from "./reset-password-form";

export const dynamic = "force-dynamic";
// The token is in the URL: don't hand it to anything this page links to.
export const metadata: Metadata = { title: "Reset password", referrer: "no-referrer" };

export default async function ResetPasswordPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const record = await findValidResetToken(token);

  if (!record) {
    return (
      <div className="flex flex-col gap-4">
        <Alert variant="destructive">
          <AlertDescription>
            This reset link is invalid, has expired, or was already used. Request a new one from
            the login page, or ask an owner or admin of your organization.
          </AlertDescription>
        </Alert>
        <Link href="/login" className="text-center text-sm text-brand hover:underline">
          Back to log in
        </Link>
      </div>
    );
  }

  return <ResetPasswordForm token={token} email={record.user.email} />;
}
