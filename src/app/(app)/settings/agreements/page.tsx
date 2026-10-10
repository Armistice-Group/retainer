import Link from "next/link";
import { RefreshCw } from "lucide-react";
import { requireOrgContext } from "@/lib/org-context";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { IntegrationCardHeader } from "@/components/integration-card-header";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CopyButton } from "@/components/copy-button";
import { SubmitButton } from "@/components/forms/submit-button";
import { ConfirmSubmitButton } from "@/components/forms/confirm-submit-button";
import { IntegrationCredentials } from "../integration-credentials";
import { DocumensoForm, IroncladForm } from "./connect-forms";
import { AgreementsInbox, DismissedAgreements } from "./agreements-inbox";
import { disconnectAgreementProviderAction, syncAgreementsNowAction } from "@/actions/agreements";
import { agreementsInbox } from "@/lib/services/agreements";
import { docuSignEnvironment, isDocuSignConfigured } from "@/lib/integrations/agreements/providers";
import { AGREEMENT_PROVIDER_LABELS, type AgreementProviderId } from "@/lib/integrations/agreements/parse";
import { describeIntegration } from "@/lib/instance-config";
import { getRequestOrigin } from "@/lib/url";
import type { AgreementConnection } from "@/generated/prisma/client";

const when = (d: Date) => d.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });

/** Sync state under a connected service's header (the header says Connected). */
function SyncDetails({ connection, extra }: { connection: AgreementConnection; extra?: string | null }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 text-xs text-muted-foreground">
      {extra ? <p className="truncate">{extra}</p> : null}
      <p>{connection.lastSyncedAt ? `Last synced ${when(connection.lastSyncedAt)}` : "Not synced yet"}</p>
      {connection.lastError ? <p className="text-destructive">{connection.lastError}</p> : null}
    </div>
  );
}

function Disconnect({ provider }: { provider: AgreementProviderId }) {
  const label = AGREEMENT_PROVIDER_LABELS[provider];
  return (
    <form action={disconnectAgreementProviderAction.bind(null, provider)}>
      <ConfirmSubmitButton
        variant="outline"
        size="sm"
        confirmMessage={`Disconnect ${label}? Agreements already pulled stay where they are linked; new ones stop arriving.`}
      >
        Disconnect
      </ConfirmSubmitButton>
    </form>
  );
}

function Steps({ children }: { children: React.ReactNode }) {
  return (
    <details className="text-sm">
      <summary className="cursor-pointer font-medium">How to set this up</summary>
      <ol className="mt-2 list-decimal space-y-1 pl-4 text-xs text-muted-foreground">{children}</ol>
    </details>
  );
}

export default async function AgreementsSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ docusign?: string }>;
}) {
  const { org, user, role } = await requireOrgContext();
  if (role !== "OWNER" && role !== "ADMIN") {
    return (
      <p className="text-sm text-muted-foreground">
        Only owners and admins can connect e-signature services and link signed agreements. You
        can see linked agreements on each client and project.
      </p>
    );
  }
  const { docusign } = await searchParams;
  const actor = { orgId: org.id, actorId: user.id, role };
  const [connections, inbox, dsConfigured, dsEnvironment, dsFields, origin] = await Promise.all([
    prisma.agreementConnection.findMany({ where: { orgId: org.id } }),
    agreementsInbox(actor),
    isDocuSignConfigured(),
    docuSignEnvironment(),
    describeIntegration("docusign"),
    getRequestOrigin(),
  ]);
  const byProvider = new Map(connections.map((c) => [c.provider, c]));
  const ds = byProvider.get("DOCUSIGN");
  const dm = byProvider.get("DOCUMENSO");
  const ic = byProvider.get("IRONCLAD");
  const callbackUrl = `${origin}/api/integrations/docusign/callback`;
  const consoleUrl =
    dsEnvironment === "production"
      ? "https://admin.docusign.com/apps-and-keys"
      : "https://admindemo.docusign.com/apps-and-keys";

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <div>
            <CardTitle className="text-base">Agreements inbox</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Signed agreements from DocuSign, Documenso and Ironclad arrive here every hour.
              Link each to a client (and a project, if it&apos;s for one) and it shows on that
              page with its signers and signed copy. Consultainer only reads; it never sends
              anything for signature. {inbox.linkedCount ? `${inbox.linkedCount} linked so far.` : ""}
            </p>
          </div>
          {connections.length ? (
            <form action={syncAgreementsNowAction} className="shrink-0">
              <SubmitButton size="sm" variant="outline" pendingText="Syncing...">
                <RefreshCw className="size-3.5" /> Sync now
              </SubmitButton>
            </form>
          ) : null}
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {connections.length ? (
            <AgreementsInbox agreements={inbox.unmatched} clients={inbox.clients} />
          ) : (
            <p className="text-sm text-muted-foreground">
              Connect DocuSign, Documenso or Ironclad below to start pulling signed agreements.
            </p>
          )}
          <DismissedAgreements agreements={inbox.dismissed} />
        </CardContent>
      </Card>

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <Card>
          <IntegrationCardHeader
            title="DocuSign"
            logos={["docusign"]}
            status={{ connected: !!ds, detail: ds?.accountName }}
          />
          <CardContent className="flex flex-col gap-4">
            {docusign === "forbidden" ? (
              <Alert variant="destructive">
                <AlertDescription>Only owners and admins can connect DocuSign.</AlertDescription>
              </Alert>
            ) : null}
            {docusign === "not-configured" && !dsConfigured ? (
              <Alert variant="destructive">
                <AlertDescription>
                  DocuSign isn&apos;t set up on this instance yet. Add its credentials below.
                </AlertDescription>
              </Alert>
            ) : null}
            {docusign === "error" || docusign === "denied" ? (
              <Alert variant="destructive">
                <AlertDescription>
                  {docusign === "denied"
                    ? "DocuSign access wasn't granted. Click Connect and choose Allow access."
                    : "Couldn't connect to DocuSign. Check the integration key, secret key, environment and redirect URI, then try again."}
                </AlertDescription>
              </Alert>
            ) : null}
            <div className="flex items-start justify-between gap-4">
              {ds ? (
                <SyncDetails
                  connection={ds}
                  extra={`${dsEnvironment === "production" ? "Production" : "Demo"} environment`}
                />
              ) : (
                <p className="text-sm text-muted-foreground">
                  {dsEnvironment === "production" ? "Production" : "Demo"} environment.
                </p>
              )}
              <div className="flex shrink-0 items-center gap-2">
                {dsConfigured ? (
                  <Button size="sm" variant={ds ? "outline" : "default"} asChild>
                    <Link href="/api/integrations/docusign/connect" prefetch={false}>
                      {ds ? "Reconnect" : "Connect"}
                    </Link>
                  </Button>
                ) : null}
                {ds ? <Disconnect provider="DOCUSIGN" /> : null}
              </div>
            </div>
            <Steps>
              <li>
                Open Consultainer at the address your team uses (not localhost). The redirect URI
                below follows it.
              </li>
              <li>
                Sign in to DocuSign&apos;s{" "}
                <a href={consoleUrl} target="_blank" rel="noreferrer" className="text-brand hover:underline">
                  Apps and Keys
                </a>{" "}
                page ({dsEnvironment === "production" ? "your production account" : "a free developer account"})
                and click <strong>Add App and Integration Key</strong>. Name it Consultainer.
              </li>
              <li>
                Under <strong>Authentication</strong>, answer <strong>Yes</strong> to storing a
                client secret (Authorization Code Grant), click <strong>Add Secret Key</strong> and
                copy the key now; DocuSign shows it only once.
              </li>
              <li>
                Under <strong>Additional settings → Redirect URIs</strong>, click{" "}
                <strong>Add URI</strong> and paste:
                <span className="mt-1 flex items-center gap-2">
                  <code className="min-w-0 flex-1 truncate rounded bg-muted px-2 py-1 text-xs">{callbackUrl}</code>
                  <CopyButton value={callbackUrl} label="Copy" />
                </span>
              </li>
              <li>
                Click <strong>Save</strong>. Copy the <strong>Integration Key</strong> and the
                secret key into the fields below, pick the environment (Demo for a developer
                account) and click <strong>Save credentials</strong>.
              </li>
              <li>
                Click <strong>Connect</strong>, sign in to DocuSign and click{" "}
                <strong>Allow access</strong>. Then click <strong>Sync now</strong> above.
              </li>
              <li>
                For real agreements, DocuSign has to approve the app for production first (its{" "}
                <strong>go-live</strong>{" "}review on the app&apos;s page). Once approved, add a
                secret key and the redirect URI to the app in your production account, switch the
                environment to Production here, and reconnect.
              </li>
            </Steps>
            <IntegrationCredentials
              integration="docusign"
              fields={dsFields}
              configured={dsConfigured}
              canEdit={role === "OWNER"}
              callbackUrl={callbackUrl}
              callbackLabel="redirect URI"
              appUrl={consoleUrl}
              appLabel="DocuSign → Apps and Keys"
            />
          </CardContent>
        </Card>

        <div className="flex flex-col gap-6">
          <Card>
            <IntegrationCardHeader
              title="Documenso"
              logos={["documenso"]}
              status={{ connected: !!dm, detail: dm?.accountName }}
            />
            <CardContent className="flex flex-col gap-4">
              {dm ? (
                <div className="flex items-start justify-between gap-4">
                  <SyncDetails connection={dm} />
                  <Disconnect provider="DOCUMENSO" />
                </div>
              ) : null}
              <Steps>
                <li>
                  In Documenso, open the team whose documents you want here, then{" "}
                  <strong>Team settings → API tokens</strong> (or{" "}
                  <strong>Settings → API tokens</strong> for personal documents).
                </li>
                <li>
                  Enter the name Consultainer, choose when it expires (or never), and click{" "}
                  <strong>Create token</strong>. Copy it now; Documenso shows it only once.
                </li>
                <li>
                  Paste it below with your Documenso address and click{" "}
                  <strong>Connect Documenso</strong>. Consultainer checks the key works before
                  saving it.
                </li>
                <li>
                  Self-hosted on a private network? Set <code>ALLOW_PRIVATE_FETCH=true</code> on
                  the server, or Consultainer refuses to reach it.
                </li>
              </Steps>
              <DocumensoForm baseUrl={dm?.baseUrl ?? null} connected={!!dm} />
            </CardContent>
          </Card>

          <Card>
            <IntegrationCardHeader
              title="Ironclad"
              logos={["ironclad"]}
              status={{ connected: !!ic, detail: ic?.accountName }}
            />
            <CardContent className="flex flex-col gap-4">
              {ic ? (
                <div className="flex items-start justify-between gap-4">
                  <SyncDetails connection={ic} extra={ic.actAsEmail ? `Reading as ${ic.actAsEmail}` : null} />
                  <Disconnect provider="IRONCLAD" />
                </div>
              ) : null}
              <Steps>
                <li>
                  You need an Ironclad plan with API access and an Ironclad admin. In Ironclad,
                  register an OAuth client app for Consultainer that uses the{" "}
                  <strong>Client Credentials</strong> grant.
                </li>
                <li>
                  Give it the scopes <code>public.records.readRecords</code> and{" "}
                  <code>public.records.readAttachments</code> only.
                </li>
                <li>
                  Copy its client ID and client secret into the form below, pick the Ironclad site
                  you sign in at, and enter the email of the Ironclad user Consultainer reads as
                  (it sees the records that person can see).
                </li>
                <li>
                  Click <strong>Connect Ironclad</strong>. Consultainer gets a token and reads one
                  record to check, then pulls every record in the next sync.
                </li>
              </Steps>
              <IroncladForm
                region={ic?.accountId ?? null}
                clientId={ic?.clientId ?? null}
                actAsEmail={ic?.actAsEmail ?? null}
                connected={!!ic}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
