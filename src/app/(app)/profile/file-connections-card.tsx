"use client";

import { useTransition } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { IntegrationCardHeader, IntegrationStatus } from "@/components/integration-card-header";
import { IntegrationLogo, type IntegrationLogoName } from "@/components/integration-logo";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { disconnectFileServiceAction } from "@/actions/file-connections";

export type FileServiceRow = {
  id: string;
  slug: string;
  label: string;
  configured: boolean;
  account: string | null;
};

const MESSAGES: Record<string, { tone: "ok" | "error"; text: string }> = {
  connected: {
    tone: "ok",
    text: "Connected. Open a client or project, then Documents → Add to browse it.",
  },
  error: {
    tone: "error",
    text: "Couldn't connect. Try again; if it keeps failing, ask an owner to check that service's redirect URI and client secret under Settings → Integrations → Files & docs.",
  },
  cancelled: {
    tone: "error",
    text: "Not connected: you cancelled, or the service refused the request. If you didn't cancel, ask an owner to check the app's permissions (and admin consent, for Microsoft).",
  },
  "not-configured": { tone: "error", text: "That service isn't set up on this instance yet. An owner adds it under Settings → Integrations." },
  unknown: { tone: "error", text: "Unknown service." },
  refused: {
    tone: "error",
    text: "Not connected: the service refused. Ask an owner to check that service's setup under Settings → Integrations → Files & docs (redirect URI, permissions, and admin consent for Microsoft).",
  },
};

const LOGOS: Record<string, IntegrationLogoName> = {
  GOOGLE_DRIVE: "google-drive",
  DROPBOX: "dropbox",
  ONEDRIVE: "onedrive",
  NOTION: "notion",
};

/** The person's own connections to Drive, Dropbox, OneDrive and Notion —
 * used to browse and pick what to link, with their own access. */
export function FileConnectionsCard({
  services,
  status,
  reason,
}: {
  services: FileServiceRow[];
  status?: string;
  /** What the service said when it refused, if it said anything. */
  reason?: string;
}) {
  const [pending, startTransition] = useTransition();
  const message = status ? MESSAGES[status] : undefined;
  return (
    <Card id="files">
      <IntegrationCardHeader
        title="Files & docs"
        logos={services.flatMap((s) => LOGOS[s.id] ?? [])}
        status={{
          connected: services.some((s) => s.account),
          detail: `${services.filter((s) => s.account).length} of ${services.length}`,
        }}
        description={
          <span className="text-xs">
            Connect the places your documents live. Then, when you add a document to a client or
            project, you can browse and search them, and linked documents show their real titles
            and last-edited dates. Each connection is yours alone: it uses your access, and nobody
            else can browse through it. Disconnecting doesn&apos;t remove documents you already linked.
          </span>
        }
      />
      <CardContent className="flex flex-col gap-2">
        {message ? (
          <Alert variant={message.tone === "error" ? "destructive" : "default"}>
            <AlertDescription>
              {message.text}
              {status === "refused" && reason ? <span className="mt-1 block font-mono text-xs">{reason.slice(0, 300)}</span> : null}
            </AlertDescription>
          </Alert>
        ) : null}
        {services.map((s) => (
          <div key={s.id} className="flex items-center gap-3 rounded-lg border border-border p-3 text-sm">
            {LOGOS[s.id] ? <IntegrationLogo name={LOGOS[s.id]} /> : null}
            <div className="min-w-0 flex-1">
              <p className="font-medium">{s.label}</p>
              {s.configured || s.account ? (
                <IntegrationStatus connected={!!s.account} detail={s.account} className="text-xs" />
              ) : (
                <p className="text-xs text-muted-foreground">
                  Not set up on this instance — an owner adds it under Settings → Integrations.
                </p>
              )}
            </div>
            {s.account ? (
              <Button
                variant="outline"
                size="sm"
                disabled={pending}
                onClick={() => startTransition(() => disconnectFileServiceAction(s.id))}
              >
                Disconnect
              </Button>
            ) : s.configured ? (
              <Button size="sm" asChild>
                <a href={`/api/integrations/files/${s.slug}/connect`}>Connect</a>
              </Button>
            ) : null}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
