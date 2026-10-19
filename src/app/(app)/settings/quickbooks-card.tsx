import Link from "next/link";
import { IntegrationRow } from "@/components/integration-row";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ConfirmSubmitButton } from "@/components/forms/confirm-submit-button";
import { disconnectQuickBooksAction } from "@/actions/integrations";
import { DocsLink } from "@/components/docs-link";

export function QuickBooksCard({
  connected,
  realmId,
  readOnly,
  callbackStatus,
  configured,
  credentials,
}: {
  connected: boolean;
  realmId: string | null;
  readOnly: boolean;
  callbackStatus?: string;
  configured: boolean;
  /** Instance credentials form (see integration-credentials.tsx). */
  credentials: React.ReactNode;
}) {
  return (
    <IntegrationRow
      id="quickbooks"
      title="QuickBooks"
      logos={["quickbooks"]}
      status={{ connected, detail: realmId ? `company ${realmId}` : null }}
      description="Push invoices to QuickBooks Online and sync their paid status back."
      defaultOpen={!!callbackStatus && callbackStatus !== "connected"}
    >
        {callbackStatus === "forbidden" ? (
          <Alert variant="destructive">
            <AlertDescription>Only owners and admins can connect integrations.</AlertDescription>
          </Alert>
        ) : null}
        {callbackStatus === "not-configured" && !configured ? (
          <Alert variant="destructive">
            <AlertDescription>
              QuickBooks isn&apos;t set up on this instance yet — add its credentials below.
            </AlertDescription>
          </Alert>
        ) : null}
        {callbackStatus === "error" ? (
          <Alert variant="destructive">
            <AlertDescription>
              Couldn&apos;t connect to QuickBooks. Double-check your QuickBooks app credentials and
              try again.
            </AlertDescription>
          </Alert>
        ) : null}

        <div className="flex items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground">
            {connected
              ? "Push an invoice from its page; paid status syncs back."
              : configured
                ? "Connect, then sign in to Intuit and pick the company."
                : "Add your QuickBooks app's credentials first, then connect."}
          </p>
          {readOnly ? null : connected ? (
            <form action={disconnectQuickBooksAction} className="shrink-0">
              <ConfirmSubmitButton
                variant="outline"
                size="sm"
                confirmMessage="Disconnect QuickBooks? Existing pushed invoices stay linked, but you won't be able to push new ones until you reconnect."
              >
                Disconnect
              </ConfirmSubmitButton>
            </form>
          ) : !configured ? null : (
            <Button size="sm" asChild className="shrink-0">
              <Link href="/api/integrations/quickbooks/connect" prefetch={false}>
                Connect
              </Link>
            </Button>
          )}
        </div>
        {connected ? null : <SetupGuide />}
        {credentials}
    </IntegrationRow>
  );
}

function SetupGuide() {
  return (
    <div className="text-sm">
      <p className="font-medium">How to set it up</p>
      <ol className="mt-2 list-decimal space-y-1 pl-4 text-xs text-muted-foreground">
        <li>
          Open Consultainer at the address your team uses — the redirect URI below follows it.
        </li>
        <li>
          On developer.intuit.com, open your <strong>Dashboard</strong> and create an app for
          QuickBooks Online with the <strong>Accounting</strong> scope.
        </li>
        <li>
          Under the app&apos;s <strong>Keys and credentials</strong>, add the redirect URI below.
          Development keys only work with sandbox companies; production keys need an https
          address and Intuit&apos;s production questionnaire.
        </li>
        <li>
          Copy the client ID and client secret into the fields below, set{" "}
          <strong>Environment</strong> to match the keys, and click{" "}
          <strong>Save credentials</strong>.
        </li>
        <li>
          Click <strong>Connect</strong>, sign in to Intuit and pick the company.
        </li>
      </ol>
      <DocsLink page="integrations/quickbooks" />
    </div>
  );
}
