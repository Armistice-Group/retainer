"use client";

import { useState, useTransition } from "react";
import { startAuthentication } from "@simplewebauthn/browser";
import { KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { startPasskeyLoginAction, finishPasskeyLoginAction } from "@/actions/passkey";

export function PasskeySignInButton({ callbackUrl }: { callbackUrl: string }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function signIn() {
    setError(null);
    startTransition(async () => {
      try {
        const { options, challengeId } = await startPasskeyLoginAction();
        const response = await startAuthentication({ optionsJSON: options });
        const result = await finishPasskeyLoginAction(challengeId, response, callbackUrl);
        if (result.error) setError(result.error);
      } catch {
        setError("Couldn't sign in with a passkey. Try again or use your password.");
      }
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <Button type="button" variant="outline" className="w-full" disabled={isPending} onClick={signIn}>
        <KeyRound className="size-4" />
        {isPending ? "Waiting for passkey..." : "Sign in with a passkey"}
      </Button>
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}
