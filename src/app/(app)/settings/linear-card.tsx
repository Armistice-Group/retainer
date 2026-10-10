import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { IntegrationCardHeader } from "@/components/integration-card-header";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ConfirmSubmitButton } from "@/components/forms/confirm-submit-button";
import { disconnectLinearAction } from "@/actions/integrations";
import { CopyButton } from "@/components/copy-button";
import { DocsLink } from "@/components/docs-link";

export function LinearCard({
  connected,
  workspaceName,
  readOnly,
  callbackStatus,
  configured,
  credentials,
  canWrite = true,
  webhook,
}: {
  connected: boolean;
  workspaceName: string | null;
  readOnly: boolean;
  callbackStatus?: string;
  configured: boolean;
  /** Instance credentials form (see integration-credentials.tsx). */
  credentials: React.ReactNode;
  /** False for connections made before write access was requested. */
  canWrite?: boolean;
  /** Live updates via Linear webhooks. */
  webhook: { url: string; secretSet: boolean; lastEventAt: Date | null };
}) {
  return (
    <Card>
      <IntegrationCardHeader
        title="Linear"
        logos={["linear"]}
        status={{ connected, detail: workspaceName }}
      />
      <CardContent className="flex flex-col gap-4">
        {callbackStatus === "forbidden" ? (
          <Alert variant="destructive">
            <AlertDescription>Only owners and admins can connect integrations.</AlertDescription>
          </Alert>
        ) : null}
        {callbackStatus === "not-configured" && !configured ? (
          <Alert variant="destructive">
            <AlertDescription>
              Linear isn&apos;t set up on this instance yet — add its credentials below.
            </AlertDescription>
          </Alert>
        ) : null}
        {callbackStatus === "error" ? (
          <Alert variant="destructive">
            <AlertDescription>
              Couldn&apos;t connect to Linear. Double-check your Linear OAuth app credentials and
              try again.
            </AlertDescription>
          </Alert>
        ) : null}

        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm text-muted-foreground">
              Projects pull in Linear issues as tasks, and new tasks and edits are sent back.
            </p>
            {connected && !canWrite ? (
              <p className="mt-1 text-xs text-muted-foreground">
                Read-only access — reconnect so new tasks and edits can be sent to Linear.
              </p>
            ) : null}
          </div>
          {readOnly ? null : connected ? (
            <div className="flex shrink-0 items-center gap-2">
              {!canWrite && configured ? (
                <Button size="sm" asChild>
                  <Link href="/api/integrations/linear/connect" prefetch={false}>
                    Reconnect
                  </Link>
                </Button>
              ) : null}
              <form action={disconnectLinearAction}>
                <ConfirmSubmitButton
                  variant="outline"
                  size="sm"
                  confirmMessage="Disconnect Linear? Projects linked to a Linear team will need it reconnected before they can sync again."
                >
                  Disconnect
                </ConfirmSubmitButton>
              </form>
            </div>
          ) : !configured ? null : (
            <Button size="sm" asChild className="shrink-0">
              <Link href="/api/integrations/linear/connect" prefetch={false}>
                Connect
              </Link>
            </Button>
          )}
        </div>
        {connected ? <LiveUpdates webhook={webhook} /> : <SetupGuide webhookUrl={webhook.url} />}
        {credentials}
      </CardContent>
    </Card>
  );
}

function SetupGuide({ webhookUrl }: { webhookUrl: string }) {
  return (
    <details className="text-sm">
      <summary className="cursor-pointer font-medium">How to set this up</summary>
      <ol className="mt-2 list-decimal space-y-1 pl-4 text-xs text-muted-foreground">
        <li>
          Open Consultainer at the address your team uses (not localhost) — the callback URL
          below follows it.
        </li>
        <li>
          In Linear, go to <strong>Settings → API → OAuth applications</strong> and create a new
          application. Paste the callback URL below into <strong>Callback URLs</strong>. Turn on{" "}
          <strong>Public</strong>{" "}if you&apos;ll connect a different workspace.
        </li>
        <li>
          Optional, for live updates: turn on <strong>Webhooks</strong> with the URL{" "}
          <code className="break-all">{webhookUrl}</code> and tick <strong>Issues</strong> and{" "}
          <strong>Comments</strong>. Without it, projects sync every hour.
        </li>
        <li>
          Save the app, then copy its client ID, client secret and (if you turned on webhooks)
          webhook signing secret into the fields below and click <strong>Save credentials</strong>.
        </li>
        <li>
          Click <strong>Connect</strong>{" "}and approve read and write access. Then link projects
          from each project&apos;s page with <strong>Link Linear</strong>.
        </li>
      </ol>
      <DocsLink page="integrations/linear" />
    </details>
  );
}

function LiveUpdates({
  webhook,
}: {
  webhook: { url: string; secretSet: boolean; lastEventAt: Date | null };
}) {
  const live = webhook.secretSet && webhook.lastEventAt;
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border p-4 text-sm">
      <div className="flex items-center gap-2">
        <p className="font-medium">Live updates</p>
        {live ? (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <CheckCircle2 className="size-3.5 text-chart-3" />
            Last event {webhook.lastEventAt!.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}
          </span>
        ) : null}
      </div>
      <p className="text-muted-foreground">
        Linked projects sync with Linear every hour, including comments. For changes to show
        up right away, open your OAuth app in Linear (<strong>Settings → API</strong>), turn on{" "}
        <strong>Webhooks</strong> with this URL for <strong>Issues</strong> and{" "}
        <strong>Comments</strong>, then save the app&apos;s webhook signing secret in the
        credentials below{webhook.secretSet ? " (saved)" : ""}.
      </p>
      <div className="flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded bg-muted px-2 py-1 text-xs">
          {webhook.url}
        </code>
        <CopyButton value={webhook.url} label="Copy" />
      </div>
    </div>
  );
}
