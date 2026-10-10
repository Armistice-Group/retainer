"use client";

import Link from "next/link";
import { useActionState } from "react";
import { verifyGoogleTwoFactorAction, type ActionState } from "@/actions/auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/forms/submit-button";
import { Alert, AlertDescription } from "@/components/ui/alert";

export function GoogleTwoFactorForm({ ticket }: { ticket: string }) {
  const [state, formAction] = useActionState<ActionState, FormData>(
    verifyGoogleTwoFactorAction,
    null
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Log in</CardTitle>
        <CardDescription>
          Google confirmed your account. Enter the 6-digit code from your authenticator app to
          finish signing in.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="flex flex-col gap-4">
          <input type="hidden" name="ticket" value={ticket} />
          {state?.error ? (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          ) : null}
          <div className="flex flex-col gap-2">
            <Label htmlFor="code">Authentication code</Label>
            <Input
              id="code"
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="123456 or a recovery code"
              autoFocus
              required
            />
            {state?.fieldErrors?.code ? (
              <p className="text-sm text-destructive">{state.fieldErrors.code[0]}</p>
            ) : null}
          </div>
          <SubmitButton className="mt-2 w-full" pendingText="Verifying...">
            Verify
          </SubmitButton>
          <Link href="/login" className="text-center text-sm text-muted-foreground hover:underline">
            Back to log in
          </Link>
        </form>
      </CardContent>
    </Card>
  );
}
