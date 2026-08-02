"use client";

import { useActionState, useState, useTransition } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/forms/submit-button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  startTwoFactorSetupAction,
  confirmTwoFactorSetupAction,
  cancelTwoFactorSetupAction,
  disableTwoFactorAction,
  type TwoFactorConfirmState,
} from "@/actions/two-factor";
import type { ActionState } from "@/actions/auth";

export function TwoFactorCard({ enabled }: { enabled: boolean }) {
  const [isPending, startTransition] = useTransition();
  const [setup, setSetup] = useState<{ secret: string; uri: string } | null>(null);
  const [confirmState, confirmAction] = useActionState<TwoFactorConfirmState, FormData>(
    confirmTwoFactorSetupAction,
    null
  );
  const [disableState, disableAction] = useActionState<ActionState, FormData>(
    disableTwoFactorAction,
    null
  );

  if (confirmState?.recoveryCodes) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Save your recovery codes</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Alert>
            <AlertDescription>
              Two-factor authentication is now enabled. Save these codes somewhere safe — each
              works once, and this is the only time they&apos;ll be shown.
            </AlertDescription>
          </Alert>
          <div className="grid grid-cols-2 gap-2 rounded-md border bg-muted/40 p-4 font-mono text-sm">
            {confirmState.recoveryCodes.map((code) => (
              <div key={code}>{code}</div>
            ))}
          </div>
          <Button onClick={() => window.location.reload()} className="self-start">
            Done
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (enabled) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Two-factor authentication</CardTitle>
          <Badge variant="secondary">Enabled</Badge>
        </CardHeader>
        <CardContent>
          <form action={disableAction} className="flex flex-col gap-3">
            {disableState?.error ? (
              <Alert variant="destructive">
                <AlertDescription>{disableState.error}</AlertDescription>
              </Alert>
            ) : null}
            <p className="text-sm text-muted-foreground">
              Disabling removes the authenticator requirement and your recovery codes.
            </p>
            <div className="flex flex-col gap-2 sm:max-w-xs">
              <Label htmlFor="disable-password">Confirm password</Label>
              <Input id="disable-password" name="password" type="password" />
              {disableState?.fieldErrors?.password ? (
                <p className="text-sm text-destructive">{disableState.fieldErrors.password[0]}</p>
              ) : null}
            </div>
            <SubmitButton variant="outline" className="self-start" pendingText="Disabling...">
              Disable 2FA
            </SubmitButton>
          </form>
        </CardContent>
      </Card>
    );
  }

  if (setup) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Set up two-factor authentication</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            Add this key to your authenticator app (1Password, Authy, Google Authenticator), then
            enter the 6-digit code it generates.
          </p>
          <div className="flex flex-col gap-1">
            <Label>Manual entry key</Label>
            <code className="w-fit rounded-md border bg-muted/40 px-3 py-2 text-sm tracking-wider">
              {setup.secret}
            </code>
            <a
              href={setup.uri}
              className="mt-1 w-fit text-xs text-primary hover:underline"
            >
              Open in authenticator app
            </a>
          </div>
          <form action={confirmAction} className="flex flex-col gap-3">
            {confirmState?.error ? (
              <Alert variant="destructive">
                <AlertDescription>{confirmState.error}</AlertDescription>
              </Alert>
            ) : null}
            <div className="flex flex-col gap-2 sm:max-w-xs">
              <Label htmlFor="confirm-code">6-digit code</Label>
              <Input id="confirm-code" name="code" inputMode="numeric" autoFocus required />
              {confirmState?.fieldErrors?.code ? (
                <p className="text-sm text-destructive">{confirmState.fieldErrors.code[0]}</p>
              ) : null}
            </div>
            <div className="flex gap-2">
              <SubmitButton pendingText="Verifying...">Verify and enable</SubmitButton>
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  startTransition(async () => {
                    await cancelTwoFactorSetupAction();
                    setSetup(null);
                  })
                }
              >
                Cancel
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Two-factor authentication</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">
          Add an authenticator app as a second step when logging in.
        </p>
        <Button
          className="self-start"
          disabled={isPending}
          onClick={() =>
            startTransition(async () => {
              const result = await startTwoFactorSetupAction();
              setSetup(result);
            })
          }
        >
          {isPending ? "Starting..." : "Enable 2FA"}
        </Button>
      </CardContent>
    </Card>
  );
}
