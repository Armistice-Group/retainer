"use client";

import { useActionState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/forms/submit-button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { updateProfileAction, changePasswordAction, changeEmailAction } from "@/actions/profile";
import type { ActionState } from "@/actions/auth";

export function ProfileNameForm({ name }: { name: string }) {
  const [state, formAction] = useActionState<ActionState, FormData>(updateProfileAction, null);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {state?.error ? (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}
      <div className="flex flex-col gap-2">
        <Label htmlFor="name">Name</Label>
        <Input id="name" name="name" defaultValue={name} required />
        {state?.fieldErrors?.name ? (
          <p className="text-sm text-destructive">{state.fieldErrors.name[0]}</p>
        ) : null}
      </div>
      <div>
        <SubmitButton pendingText="Saving...">Save name</SubmitButton>
      </div>
    </form>
  );
}

export function ChangeEmailForm({
  currentEmail,
  hasPassword,
  emailEnabled,
}: {
  currentEmail: string;
  hasPassword: boolean;
  emailEnabled: boolean;
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(changeEmailAction, null);

  if (state?.emailChangePending) {
    return (
      <Alert>
        <AlertDescription>
          We sent a confirmation link to your new address — click it to finish changing your
          email. It expires in 24 hours, and nothing changes until then.
        </AlertDescription>
      </Alert>
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
        <Label htmlFor="currentEmail">Current email</Label>
        <Input id="currentEmail" value={currentEmail} disabled />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="newEmail">New email</Label>
        <Input id="newEmail" name="newEmail" type="email" required />
        {state?.fieldErrors?.newEmail ? (
          <p className="text-sm text-destructive">{state.fieldErrors.newEmail[0]}</p>
        ) : null}
      </div>
      {hasPassword ? (
        <div className="flex flex-col gap-2">
          <Label htmlFor="email-change-password">Confirm password</Label>
          <Input id="email-change-password" name="password" type="password" required />
          {state?.fieldErrors?.password ? (
            <p className="text-sm text-destructive">{state.fieldErrors.password[0]}</p>
          ) : null}
        </div>
      ) : null}
      <p className="text-xs text-muted-foreground">
        {emailEnabled
          ? "We'll email a confirmation link to the new address before anything changes."
          : "You'll be signed out and can log back in with the new address."}
      </p>
      <div>
        <SubmitButton pendingText="Updating...">Update email</SubmitButton>
      </div>
    </form>
  );
}

export function ChangePasswordForm() {
  const [state, formAction] = useActionState<ActionState, FormData>(changePasswordAction, null);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {state?.error ? (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}
      <div className="flex flex-col gap-2">
        <Label htmlFor="currentPassword">Current password</Label>
        <Input id="currentPassword" name="currentPassword" type="password" required />
        {state?.fieldErrors?.currentPassword ? (
          <p className="text-sm text-destructive">{state.fieldErrors.currentPassword[0]}</p>
        ) : null}
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="newPassword">New password</Label>
        <Input id="newPassword" name="newPassword" type="password" required />
        {state?.fieldErrors?.newPassword ? (
          <p className="text-sm text-destructive">{state.fieldErrors.newPassword[0]}</p>
        ) : (
          <p className="text-xs text-muted-foreground">
            At least 10 characters, with a letter and a number.
          </p>
        )}
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="confirmPassword">Confirm new password</Label>
        <Input id="confirmPassword" name="confirmPassword" type="password" required />
        {state?.fieldErrors?.confirmPassword ? (
          <p className="text-sm text-destructive">{state.fieldErrors.confirmPassword[0]}</p>
        ) : null}
      </div>
      <div>
        <SubmitButton pendingText="Updating...">Update password</SubmitButton>
      </div>
    </form>
  );
}
