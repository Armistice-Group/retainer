"use client";

import { useActionState } from "react";
import { Landmark } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { IntegrationCardHeader } from "@/components/integration-card-header";
import { DocsLink } from "@/components/docs-link";
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
      <IntegrationCardHeader title="Collect payments (Mercury)" logos={["mercury"]} status={{ connected }} />
      <CardContent className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">
          {connected
            ? "Clients can pay sent invoices from a Mercury-hosted pay page by card or ACH. Payment status is checked every hour."
            : "For organizations that bank with Mercury: clients pay sent invoices on a Mercury-hosted page, straight into your account. Used instead of Stripe if both are connected."}
        </p>

        {!connected ? (
          readOnly ? null : (
            <form action={formAction} className="flex flex-col gap-3">
              <details className="text-sm">
                <summary className="cursor-pointer font-medium">How to set this up</summary>
                <ol className="mt-2 list-decimal space-y-1 pl-4 text-xs text-muted-foreground">
                  <li>
                    In Mercury, open <strong>Settings → Tokens</strong> and create a token with{" "}
                    <strong>Read and Write</strong> access.
                  </li>
                  <li>
                    Mercury asks which IP addresses may use it: enter this server&apos;s public IP
                    address.
                  </li>
                  <li>
                    Paste the token below and click <strong>Connect Mercury</strong>.
                  </li>
                  <li>
                    Pick the account invoice payments go into under{" "}
                    <strong>Deposit invoice payments into</strong> and click <strong>Save</strong>.
                  </li>
                </ol>
                <DocsLink page="integrations/payments#collect-payments-with-mercury" />
              </details>
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
                ) : null}
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
