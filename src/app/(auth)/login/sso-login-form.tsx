"use client";

import { useActionState } from "react";
import { startSsoLoginAction } from "@/actions/sso";
import type { ActionState } from "@/actions/auth";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/forms/submit-button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export function SsoLoginForm({ onBack }: { onBack: () => void }) {
  const [state, formAction] = useActionState<ActionState, FormData>(startSsoLoginAction, null);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {state?.error ? (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}
      <div className="flex flex-col gap-2">
        <Label htmlFor="sso-email">Work email</Label>
        <Input id="sso-email" name="email" type="email" autoComplete="email" required />
        {state?.fieldErrors?.email ? (
          <p className="text-sm text-destructive">{state.fieldErrors.email[0]}</p>
        ) : null}
      </div>
      <div className="flex gap-2">
        <SubmitButton pendingText="Redirecting...">Continue with SSO</SubmitButton>
        <Button type="button" variant="outline" onClick={onBack}>
          Back
        </Button>
      </div>
    </form>
  );
}
