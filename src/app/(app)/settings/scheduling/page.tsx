import Link from "next/link";
import { Clock } from "lucide-react";
import { requireOrgContext } from "@/lib/org-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { IntegrationCardHeader } from "@/components/integration-card-header";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CopyButton } from "@/components/copy-button";
import { ConfirmSubmitButton } from "@/components/forms/confirm-submit-button";
import { disconnectSchedulingAction } from "@/actions/scheduling";
import { schedulingSettings } from "@/lib/services/scheduling";
import { ActionButton, CalcomForm, CalendlyForm, CompanyQuestionForm, EventTypeRow, OrgBookingUrlForm } from "./forms";

const when = (d: Date) => d.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });

type Settings = Awaited<ReturnType<typeof schedulingSettings>>;
type Connection = Settings["connections"][number];

function Steps({ children }: { children: React.ReactNode }) {
  return (
    <details className="text-sm">
      <summary className="cursor-pointer font-medium">How to set this up</summary>
      <ol className="mt-2 list-decimal space-y-1 pl-4 text-xs text-muted-foreground">{children}</ol>
    </details>
  );
}

function CopyRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      <span className="flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded bg-muted px-2 py-1 text-xs">{value}</code>
        <CopyButton value={value} label="Copy" />
      </span>
    </div>
  );
}

const account = (conn: Connection | undefined) => (conn ? (conn.accountName ?? conn.accountEmail ?? null) : null);

/** Sync state under a connected service's header (the header says Connected). */
function SyncDetails({ conn, extra }: { conn: Connection; extra?: string | null }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 text-xs text-muted-foreground">
      {extra ? <p className="truncate">{extra}</p> : null}
      {conn.mode === "POLLING" ? (
        <p className="flex items-center gap-1.5">
          <Clock className="size-3" />
          Checking for new bookings every hour
          {conn.lastSyncedAt ? ` · last checked ${when(conn.lastSyncedAt)}` : " · not checked yet"}
        </p>
      ) : (
        <p>
          {conn.lastWebhookAt
            ? `Last booking update received ${when(conn.lastWebhookAt)}`
            : "No booking updates received yet"}
        </p>
      )}
      {conn.lastError ? <p className="text-destructive">{conn.lastError}</p> : null}
    </div>
  );
}

function Disconnect({ provider, label }: { provider: string; label: string }) {
  return (
    <form action={disconnectSchedulingAction.bind(null, provider)}>
      <ConfirmSubmitButton
        variant="outline"
        size="sm"
        confirmMessage={`Disconnect ${label}? Bookings and draft clients already here stay; new bookings stop arriving.`}
      >
        Disconnect
      </ConfirmSubmitButton>
    </form>
  );
}

function EventTypes({ conn, projects }: { conn: Connection; projects: Settings["projects"] }) {
  return (
    <div className="flex flex-col gap-3 border-t border-border pt-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">Event types</p>
        <ActionButton kind="refresh" provider={conn.provider}>
          Refresh
        </ActionButton>
      </div>
      {conn.eventTypes.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No event types yet. Click Refresh after creating one; new ones also appear with their first booking.
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          {conn.eventTypes.map((t) => (
            <EventTypeRow key={t.id} eventType={t} projects={projects} />
          ))}
        </ul>
      )}
      <p className="text-xs text-muted-foreground">
        <strong>Intake</strong>: a booking from someone you don&apos;t know becomes a draft client.{" "}
        <strong>Existing clients</strong>: the booking goes to the client whose contact (or company domain) booked;
        someone unknown still becomes a draft. <strong>Ignore</strong>: bookings aren&apos;t brought in. The project and
        billable flag are what the meetings inbox suggests when the meeting shows up from your calendar.
      </p>
      <CompanyQuestionForm provider={conn.provider} value={conn.companyQuestion} />
    </div>
  );
}

export default async function SchedulingSettingsPage() {
  const { org, user, role } = await requireOrgContext();
  if (role !== "OWNER" && role !== "ADMIN") {
    return (
      <p className="text-sm text-muted-foreground">
        Only owners and admins can connect Cal.com or Calendly. Bookings for meetings you host show on your calendar and
        on each client.
      </p>
    );
  }
  const settings = await schedulingSettings({ orgId: org.id, actorId: user.id, role });
  const cal = settings.connections.find((c) => c.provider === "CALCOM");
  const cy = settings.connections.find((c) => c.provider === "CALENDLY");
  const isLocal = /\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(settings.origin);

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Bookings and draft clients</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            Connect Cal.com or Calendly and every booking comes in as it happens. Someone you don&apos;t know yet
            becomes a <strong>draft client</strong> with their answers, under{" "}
            <Link href="/clients?view=drafts" className="text-brand hover:underline">
              Clients → Drafts
            </Link>
            , and owners and admins get an alert. Bookings from your contacts show on their client and on the calendar.
            Consultainer never books, moves or cancels anything.
          </p>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {isLocal ? (
            <Alert>
              <AlertDescription>
                This instance&apos;s address is {settings.origin}. Cal.com and Calendly can&apos;t reach it, so webhooks
                won&apos;t arrive. Set the Instance URL under Settings → General (or AUTH_URL) first.
              </AlertDescription>
            </Alert>
          ) : null}
          <OrgBookingUrlForm value={settings.orgBookingUrl} />
          <p className="text-xs text-muted-foreground">
            Shown as <strong>Book a meeting</strong>{" "}on every client&apos;s share page. A client can have its own link
            instead (on the client page). Any https:// link works.
          </p>
        </CardContent>
      </Card>

      <div className="grid items-start gap-6 xl:grid-cols-2">
        <Card>
          <IntegrationCardHeader title="Cal.com" logos={["calcom"]} status={{ connected: !!cal, detail: account(cal) }} />
          <CardContent className="flex flex-col gap-4">
            {cal ? (
              <div className="flex items-start justify-between gap-4">
                <SyncDetails
                  conn={cal}
                  extra={cal.baseUrl && cal.baseUrl !== "https://api.cal.com" ? `Self-hosted at ${cal.baseUrl}` : null}
                />
                <Disconnect provider="CALCOM" label="Cal.com" />
              </div>
            ) : null}
            <Steps>
              <li>
                In Cal.com, open <strong>Settings → Developer → API keys</strong> and click <strong>New</strong>. Name
                it Consultainer, pick when it expires (or never) and copy the key; Cal.com shows it only once.
              </li>
              <li>
                Paste it below and click <strong>Connect Cal.com</strong>. Consultainer checks the key, reads your event
                types and, with the box ticked, adds the webhook in Cal.com for you.
              </li>
              <li>
                Couldn&apos;t add the webhook (or you&apos;d rather do it yourself)? In Cal.com open{" "}
                <strong>Settings → Developer → Webhooks → New</strong>, paste the subscriber URL and secret shown below,
                tick <strong>Booking created</strong>, <strong>Booking rescheduled</strong> and{" "}
                <strong>Booking cancelled</strong> (and no-show updates if offered), and save.{" "}
                <strong>Ping test</strong> should succeed.
              </li>
              <li>Choose what each event type is for under Event types.</li>
              <li>
                Self-hosted Cal.com: use the address of its API v2 service. On a private network, set{" "}
                <code>ALLOW_PRIVATE_FETCH=true</code> on the Consultainer server.
              </li>
            </Steps>
            {cal ? (
              <div className="flex flex-col gap-3 rounded-lg border border-border p-4">
                <p className="text-sm font-medium">
                  Webhook{" "}
                  <span className="font-normal text-muted-foreground">
                    {cal.webhookCreated ? "(created in Cal.com for you)" : "(add it in Cal.com by hand)"}
                  </span>
                </p>
                <CopyRow label="Subscriber URL" value={cal.webhook.url} />
                {cal.webhookCreated ? null : (
                  <>
                    <CopyRow label="Secret" value={cal.webhook.secret} />
                    <div>
                      <ActionButton kind="rotate" provider="CALCOM">
                        New secret
                      </ActionButton>
                    </div>
                  </>
                )}
              </div>
            ) : null}
            <CalcomForm baseUrl={cal?.baseUrl ?? null} connected={!!cal} />
            {cal ? <EventTypes conn={cal} projects={settings.projects} /> : null}
          </CardContent>
        </Card>

        <Card>
          <IntegrationCardHeader title="Calendly" logos={["calendly"]} status={{ connected: !!cy, detail: account(cy) }} />
          <CardContent className="flex flex-col gap-4">
            {cy ? (
              <div className="flex items-start justify-between gap-4">
                <SyncDetails conn={cy} />
                <div className="flex shrink-0 items-center gap-2">
                  {cy.mode === "POLLING" ? (
                    <ActionButton kind="sync" provider="CALENDLY">
                      Check now
                    </ActionButton>
                  ) : null}
                  <Disconnect provider="CALENDLY" label="Calendly" />
                </div>
              </div>
            ) : null}
            {cy?.mode === "POLLING" ? (
              <Alert>
                <AlertDescription>
                  Calendly only sends webhooks on its paid plans (Standard and up), so new bookings are checked for
                  every hour instead. Upgrade, then click Reconnect, to get them as they happen.
                </AlertDescription>
              </Alert>
            ) : null}
            <Steps>
              <li>
                In Calendly, open <strong>Integrations &amp; apps → API &amp; webhooks</strong>. Under{" "}
                <strong>Personal access tokens</strong>, click <strong>Get a token now</strong> (or{" "}
                <strong>Generate new token</strong>), name it Consultainer and click <strong>Create token</strong>. Copy
                it; Calendly shows it only once.
              </li>
              <li>
                Paste it below and click <strong>Connect Calendly</strong>. Consultainer reads your event types and
                subscribes to your bookings (created, cancelled, no-shows). Nothing to set up in Calendly.
              </li>
              <li>Bookings are the token owner&apos;s: connect with the account whose booking pages clients use.</li>
              <li>
                On Calendly&apos;s free plan there are no webhooks; Consultainer checks for new bookings every hour
                instead.
              </li>
              <li>Choose what each event type is for under Event types.</li>
            </Steps>
            <CalendlyForm connected={!!cy} />
            {cy ? <EventTypes conn={cy} projects={settings.projects} /> : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
