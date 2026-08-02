"use client";

import { useActionState, useTransition } from "react";
import { CheckCircle2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { SubmitButton } from "@/components/forms/submit-button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ConfirmSubmitButton } from "@/components/forms/confirm-submit-button";
import { connectSsoAction, disconnectSsoAction, setSsoEnabledAction } from "@/actions/sso";
import type { ActionState } from "@/actions/auth";

export function SsoCard({
  connected,
  issuer,
  enabled,
  readOnly,
}: {
  connected: boolean;
  issuer: string | null;
  enabled: boolean;
  readOnly: boolean;
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(connectSsoAction, null);
  const [isPending, startTransition] = useTransition();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">SSO</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="text-xs text-muted-foreground">
          OIDC single sign-on (Okta, Authentik, etc.). Members whose email matches your
          organization domain can sign in through your identity provider instead of a password.
        </p>

        {connected ? (
          <div className="flex items-center justify-between gap-4 rounded-lg border border-border p-4">
            <div>
              <p className="text-sm font-medium">SSO</p>
              <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
                <CheckCircle2 className="size-3.5 text-chart-3" />
                Connected {issuer ? `· ${issuer}` : ""}
              </p>
            </div>
            {readOnly ? null : (
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="sso-enabled"
                    checked={enabled}
                    disabled={isPending}
                    onCheckedChange={(checked) =>
                      startTransition(() => setSsoEnabledAction(checked === true))
                    }
                  />
                  <Label htmlFor="sso-enabled" className="font-normal">
                    Enabled
                  </Label>
                </div>
                <form action={disconnectSsoAction}>
                  <ConfirmSubmitButton variant="outline" size="sm" confirmMessage="Disconnect SSO?">
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
            <div className="flex flex-col gap-2">
              <Label htmlFor="sso-issuer">Issuer URL</Label>
              <Input
                id="sso-issuer"
                name="issuer"
                placeholder="https://your-org.okta.com"
                required
              />
              <p className="text-xs text-muted-foreground">
                We fetch <code>/.well-known/openid-configuration</code> from this URL.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <Label htmlFor="sso-clientId">Client ID</Label>
                <Input id="sso-clientId" name="clientId" required />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="sso-clientSecret">Client Secret</Label>
                <Input id="sso-clientSecret" name="clientSecret" type="password" required />
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
