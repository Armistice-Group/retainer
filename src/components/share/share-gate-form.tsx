"use client";

import { useActionState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { SubmitButton } from "@/components/forms/submit-button";
import {
  requestShareCodeAction,
  restartShareGateAction,
  verifyShareCodeAction,
  type ShareGateState,
} from "@/actions/share-gate";

/** The email → code form shown in place of a share page while the visitor
 * hasn't verified. */
export function ShareGateForm({
  kind,
  token,
  orgName,
  stage,
}: {
  kind: "client" | "project";
  token: string;
  orgName: string;
  /** "code" when this browser already asked for a code. */
  stage: "email" | "code";
}) {
  const [sendState, sendAction] = useActionState<ShareGateState, FormData>(
    requestShareCodeAction.bind(null, kind, token),
    null
  );
  const [verifyState, verifyAction] = useActionState<ShareGateState, FormData>(
    verifyShareCodeAction.bind(null, kind, token),
    null
  );
  const restart = restartShareGateAction.bind(null, kind, token);
  const showCode = stage === "code" || !!sendState?.sent;

  if (!showCode) {
    return (
      <>
        <h1 className="text-xl font-semibold tracking-tight">Verify your email</h1>
        <p className="text-sm text-muted-foreground">
          {orgName} asks you to confirm who you are before showing this page. Enter the email
          address {orgName}{" "}has on file for you and we&apos;ll send you a code.
        </p>
        <form action={sendAction} className="flex flex-col gap-3">
          {sendState?.error ? (
            <Alert variant="destructive">
              <AlertDescription>{sendState.error}</AlertDescription>
            </Alert>
          ) : null}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="share-email">Email</Label>
            <Input id="share-email" name="email" type="email" autoComplete="email" required />
          </div>
          <div>
            <SubmitButton pendingText="Sending...">Send code</SubmitButton>
          </div>
        </form>
      </>
    );
  }

  return (
    <>
      <h1 className="text-xl font-semibold tracking-tight">Enter your code</h1>
      <p className="text-sm text-muted-foreground">
        If that address is on file, we&apos;ve sent a code to it. It expires in 10 minutes.
      </p>
      <form action={verifyAction} className="flex flex-col gap-3">
        {verifyState?.error ? (
          <Alert variant="destructive">
            <AlertDescription>{verifyState.error}</AlertDescription>
          </Alert>
        ) : null}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="share-code">Code</Label>
          <Input
            id="share-code"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9 ]*"
            maxLength={7}
            required
          />
        </div>
        <div>
          <SubmitButton pendingText="Checking...">Verify</SubmitButton>
        </div>
      </form>
      <form action={restart}>
        <Button type="submit" variant="link" className="h-auto px-0 text-sm">
          Use a different email or send a new code
        </Button>
      </form>
    </>
  );
}
