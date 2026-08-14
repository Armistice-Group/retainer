"use client";

import { useActionState } from "react";
import { CheckCircle2, Landmark } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { SubmitButton } from "@/components/forms/submit-button";
import { ConfirmSubmitButton } from "@/components/forms/confirm-submit-button";
import {
  connectMercuryAction,
  setMercuryDestinationAccountAction,
  disconnectMercuryAction,
} from "@/actions/mercury";
import type { ActionState } from "@/actions/auth";

type MercuryAccount = { id: string; name: string };

export function MercuryConnectCard({
  connected,
  destinationAccountId,
  accounts,
  readOnly,
}: {
  connected: boolean;
  destinationAccountId: string | null;
  accounts: MercuryAccount[];
  readOnly: boolean;
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(connectMercuryAction, null);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Collect payments (Mercury)</CardTitle>
        {connected ? (
          <Badge className="gap-1">
            <CheckCircle2 className="size-3" /> Connected
          </Badge>
        ) : null}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">
          {connected
            ? "Clients can pay invoices directly from a Mercury-hosted pay page — card, ACH, or internal transfer if they bank with Mercury too."
            : "An alternative to Stripe Connect for orgs that already bank with Mercury — paste a personal API token from your own Mercury dashboard instead of a separate onboarding flow."}
        </p>

        {!connected ? (
          readOnly ? null : (
            <form action={formAction} className="flex flex-col gap-3">
              {state?.error ? (
                <Alert variant="destructive">
                  <AlertDescription>{state.error}</AlertDescription>
                </Alert>
              ) : null}
              <div className="flex flex-col gap-2">
                <Label htmlFor="apiToken">Mercury API token</Label>
                <Input
                  id="apiToken"
                  name="apiToken"
                  type="password"
                  placeholder="mercury_pat_..."
                  autoComplete="off"
                />
                {state?.fieldErrors?.apiToken ? (
                  <p className="text-sm text-destructive">{state.fieldErrors.apiToken[0]}</p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Generate one at{" "}
                    <span className="font-mono">app.mercury.com → Settings → Tokens</span> with
                    read-write access.
                  </p>
                )}
              </div>
              <div>
                <SubmitButton pendingText="Connecting...">
                  <Landmark className="size-3.5" />
                  Connect Mercury
                </SubmitButton>
              </div>
            </form>
          )
        ) : (
          <div className="flex flex-col gap-4">
            {accounts.length > 0 ? (
              <form
                action={setMercuryDestinationAccountAction}
                className="flex flex-wrap items-end gap-2"
              >
                <div className="flex flex-col gap-2">
                  <Label htmlFor="accountId">Deposit invoice payments into</Label>
                  <select
                    id="accountId"
                    name="accountId"
                    defaultValue={destinationAccountId ?? ""}
                    disabled={readOnly}
                    className="h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs"
                  >
                    {accounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </div>
                {readOnly ? null : (
                  <SubmitButton variant="outline" pendingText="Saving...">
                    Save
                  </SubmitButton>
                )}
              </form>
            ) : (
              <Alert variant="destructive">
                <AlertDescription>
                  Couldn&apos;t load Mercury accounts with the saved token — it may have been
                  revoked. Disconnect and reconnect with a fresh token.
                </AlertDescription>
              </Alert>
            )}

            {readOnly ? null : (
              <form action={disconnectMercuryAction}>
                <ConfirmSubmitButton
                  variant="outline"
                  size="sm"
                  confirmMessage="Disconnect Mercury? Clients won't be able to pay invoices through Mercury until you reconnect."
                >
                  Disconnect
                </ConfirmSubmitButton>
              </form>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
