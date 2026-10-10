"use client";

import { useActionState } from "react";
import Link from "next/link";
import { resetPasswordAction, type PasswordResetState } from "@/actions/password-reset";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/forms/submit-button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export function ResetPasswordForm({ token, email }: { token: string; email: string }) {
  const [state, formAction] = useActionState<PasswordResetState, FormData>(
    resetPasswordAction,
    null
  );

  if (state?.done) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Password updated</CardTitle>
          <CardDescription>
            Log in with your new password. You&apos;ve been signed out everywhere else, and if you
            use two-factor authentication you&apos;ll still be asked for your code.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild className="w-full">
            <Link href="/login">Log in</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Choose a new password</CardTitle>
        <CardDescription>For {email}</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="flex flex-col gap-4">
          <input type="hidden" name="token" value={token} />
          {/* Lets password managers save the new password against the account. */}
          <input type="hidden" name="username" autoComplete="username" value={email} />
          {state?.error ? (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          ) : null}
          <div className="flex flex-col gap-2">
            <Label htmlFor="password">New password</Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              autoFocus
              required
            />
            {state?.fieldErrors?.password ? (
              <p className="text-sm text-destructive">{state.fieldErrors.password[0]}</p>
            ) : (
              <p className="text-xs text-muted-foreground">
                At least 10 characters, with a letter and a number.
              </p>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="confirmPassword">Confirm new password</Label>
            <Input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              autoComplete="new-password"
              required
            />
            {state?.fieldErrors?.confirmPassword ? (
              <p className="text-sm text-destructive">{state.fieldErrors.confirmPassword[0]}</p>
            ) : null}
          </div>
          <SubmitButton className="mt-2 w-full" pendingText="Saving...">
            Set new password
          </SubmitButton>
        </form>
      </CardContent>
    </Card>
  );
}
