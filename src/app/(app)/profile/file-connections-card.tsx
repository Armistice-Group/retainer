"use client";

import { useTransition } from "react";
import { CheckCircle2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { DocumentIcon } from "@/components/documents/provider-icon";
import { disconnectFileServiceAction } from "@/actions/file-connections";

export type FileServiceRow = {
  id: string;
  slug: string;
  label: string;
  configured: boolean;
  account: string | null;
};

const MESSAGES: Record<string, { tone: "ok" | "error"; text: string }> = {
  connected: { tone: "ok", text: "Connected. You can now browse it when adding a document." },
  error: { tone: "error", text: "Couldn't connect — try again." },
  cancelled: { tone: "error", text: "Connection cancelled." },
  "not-configured": { tone: "error", text: "That service isn't set up on this instance yet." },
};

/** The person's own connections to Drive, Dropbox, OneDrive and Notion —
 * used to browse and pick what to link, with their own access. */
export function FileConnectionsCard({ services, status }: { services: FileServiceRow[]; status?: string }) {
  const [pending, startTransition] = useTransition();
  const message = status ? MESSAGES[status] : undefined;
  return (
    <Card id="files">
      <CardHeader>
        <CardTitle className="text-base">Files & docs</CardTitle>
        <p className="text-xs text-muted-foreground">
          Connect the places your documents live to browse and link them from clients and
          projects, with real titles and dates. Each connection is yours alone — it uses your
          access, and nobody else can browse through it.
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {message ? (
          <Alert variant={message.tone === "error" ? "destructive" : "default"}>
            <AlertDescription>{message.text}</AlertDescription>
          </Alert>
        ) : null}
        {services.map((s) => (
          <div key={s.id} className="flex items-center gap-3 rounded-lg border border-border p-3 text-sm">
            <DocumentIcon source={s.id} className="size-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <p className="font-medium">{s.label}</p>
              {s.account ? (
                <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                  <CheckCircle2 className="size-3 text-chart-3" /> {s.account}
                </p>
              ) : !s.configured ? (
                <p className="text-xs text-muted-foreground">
                  Not set up on this instance — an owner adds it under Settings → Integrations.
                </p>
              ) : null}
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
