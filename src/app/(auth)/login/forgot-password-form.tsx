"use client";

import { useActionState } from "react";
import {
  requestPasswordResetAction,
  type PasswordResetState,
} from "@/actions/password-reset";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/forms/submit-button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export function ForgotPasswordForm({
  emailEnabled,
  onBack,
}: {
  emailEnabled: boolean;
  onBack: () => void;
}) {
  const [state, formAction] = useActionState<PasswordResetState, FormData>(
    requestPasswordResetAction,
    null
  );

  if (!emailEnabled) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">
          This server can&apos;t send email, so ask an owner or admin of your organization for a
          password reset link. They can create one from Settings → Members.
        </p>
        <Button type="button" variant="outline" className="self-start" onClick={onBack}>
          Back to log in
        </Button>
      </div>
    );
  }

  if (state?.sent) {
    return (
      <div className="flex flex-col gap-4">
        <Alert>
          <AlertDescription>
            If an account exists for that email, we&apos;ve sent a link to reset your password.
            It expires in 1 hour.
          </AlertDescription>
        </Alert>
        <Button type="button" variant="outline" className="self-start" onClick={onBack}>
          Back to log in
        </Button>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {state?.error ? (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}
      <div className="flex flex-col gap-2">
        <Label htmlFor="reset-email">Email</Label>
        <Input id="reset-email" name="email" type="email" autoComplete="email" required />
        {state?.fieldErrors?.email ? (
          <p className="text-sm text-destructive">{state.fieldErrors.email[0]}</p>
        ) : null}
      </div>
      <div className="flex gap-2">
        <SubmitButton pendingText="Sending...">Email me a reset link</SubmitButton>
        <Button type="button" variant="outline" onClick={onBack}>
          Back
        </Button>
      </div>
    </form>
  );
}
