"use client";

import { useActionState } from "react";
import { requestMagicLinkAction, type ActionState } from "@/actions/auth";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/forms/submit-button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export function MagicLinkForm({ onBack }: { onBack: () => void }) {
  const [state, formAction] = useActionState<ActionState, FormData>(requestMagicLinkAction, null);

  if (state?.magicLinkSent) {
    return (
      <Alert>
        <AlertDescription>
          If an account exists for that email, we&apos;ve sent a login link. It expires in 15
          minutes.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="magic-email">Email</Label>
        <Input id="magic-email" name="email" type="email" autoComplete="email" required />
        {state?.fieldErrors?.email ? (
          <p className="text-sm text-destructive">{state.fieldErrors.email[0]}</p>
        ) : null}
      </div>
      <div className="flex gap-2">
        <SubmitButton pendingText="Sending...">Email me a login link</SubmitButton>
        <Button type="button" variant="outline" onClick={onBack}>
          Back
        </Button>
      </div>
    </form>
  );
}
