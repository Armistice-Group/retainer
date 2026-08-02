"use client";

import { useActionState, useState, useTransition } from "react";
import { CheckCircle2, XCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/forms/submit-button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ConfirmSubmitButton } from "@/components/forms/confirm-submit-button";
import {
  connectLaurelAction,
  disconnectLaurelAction,
  testLaurelConnectionAction,
} from "@/actions/laurel";
import type { ActionState } from "@/actions/auth";

export function LaurelCard({
  connected,
  customerId,
  readOnly,
}: {
  connected: boolean;
  customerId: string | null;
  readOnly: boolean;
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(connectLaurelAction, null);
  const [isPending, startTransition] = useTransition();
  const [testResult, setTestResult] = useState<{ ok: boolean; error: string | null } | null>(null);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Laurel</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="text-xs text-muted-foreground">
          Time-entry billing sync. Credentials (Customer ID, Client ID, Client Secret) are
          provisioned by Laurel&apos;s solutions team — this connects and authenticates; the
          actual data sync is a follow-up once Laurel provides the endpoint details for your
          account.
        </p>

        {connected ? (
          <div className="flex items-center justify-between gap-4 rounded-lg border border-border p-4">
            <div>
              <p className="text-sm font-medium">Laurel</p>
              <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
                <CheckCircle2 className="size-3.5 text-chart-3" />
                Connected {customerId ? `· customer ${customerId}` : ""}
              </p>
              {testResult ? (
                <p
                  className={`mt-1 flex items-center gap-1.5 text-sm ${testResult.ok ? "text-chart-3" : "text-destructive"}`}
                >
                  {testResult.ok ? (
                    <CheckCircle2 className="size-3.5" />
                  ) : (
                    <XCircle className="size-3.5" />
                  )}
                  {testResult.ok ? "Authentication OK" : testResult.error}
                </p>
              ) : null}
            </div>
            {readOnly ? null : (
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={isPending}
                  onClick={() =>
                    startTransition(async () => {
                      setTestResult(await testLaurelConnectionAction());
                    })
                  }
                >
                  Test connection
                </Button>
                <form action={disconnectLaurelAction}>
                  <ConfirmSubmitButton
                    variant="outline"
                    size="sm"
                    confirmMessage="Disconnect Laurel?"
                  >
                    Disconnect
                  </ConfirmSubmitButton>
                </form>
              </div>
            )}
          </div>
        ) : readOnly ? (
          <p className="text-sm text-muted-foreground">Not connected.</p>
        ) : (
          <form action={formAction} className="flex flex-col gap-3">
            {state?.error ? (
              <Alert variant="destructive">
                <AlertDescription>{state.error}</AlertDescription>
              </Alert>
            ) : null}
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="flex flex-col gap-2">
                <Label htmlFor="laurel-customerId">Customer ID</Label>
                <Input id="laurel-customerId" name="customerId" required />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="laurel-clientId">Client ID</Label>
                <Input id="laurel-clientId" name="clientId" required />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="laurel-clientSecret">Client Secret</Label>
                <Input id="laurel-clientSecret" name="clientSecret" type="password" required />
              </div>
            </div>
            <SubmitButton className="self-start" pendingText="Connecting...">
              Connect
            </SubmitButton>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
