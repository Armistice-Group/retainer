"use client";

import { useActionState, useTransition } from "react";
import { ExternalLink, FolderSync } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { IntegrationCardHeader } from "@/components/integration-card-header";
import type { IntegrationLogoName } from "@/components/integration-logo";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { SubmitButton } from "@/components/forms/submit-button";
import {
  fileEverythingNowAction,
  setUpFilingAction,
  turnOffFilingAction,
  updateFilingOptionsAction,
} from "@/actions/filing";
import type { ActionState } from "@/actions/auth";

const LABELS: Record<string, string> = { GOOGLE_DRIVE: "Google Drive", DROPBOX: "Dropbox", ONEDRIVE: "OneDrive" };
const LOGOS: Record<string, IntegrationLogoName> = { GOOGLE_DRIVE: "google-drive", DROPBOX: "dropbox", ONEDRIVE: "onedrive" };

export type FilingState = {
  provider: string | null;
  rootName: string | null;
  rootUrl: string | null;
  fileInvoices: boolean;
  fileDocuments: boolean;
  lastError: string | null;
  setUpBy: string | null;
};

/** Auto-filing invoice PDFs and uploaded documents into a Drive / Dropbox /
 * OneDrive folder, through the connection of the admin who sets it up. */
export function FilingCard({
  filing,
  myConnections,
  readOnly,
}: {
  filing: FilingState;
  /** Filing-capable services the viewer has connected. */
  myConnections: string[];
  readOnly: boolean;
}) {
  const [setupState, setupAction] = useActionState<ActionState, FormData>(setUpFilingAction, null);
  const [optionsState, optionsAction] = useActionState<ActionState, FormData>(updateFilingOptionsAction, null);
  const [pending, startTransition] = useTransition();

  return (
    <Card className="lg:col-span-2" id="filing">
      <IntegrationCardHeader
        title="Filing"
        icon={FolderSync}
        logos={filing.provider && LOGOS[filing.provider] ? [LOGOS[filing.provider]] : []}
        status={{
          connected: !!filing.provider,
          connectedLabel: "On",
          detail: filing.provider ? LABELS[filing.provider] : null,
          notConnectedLabel: "Off",
          problem: filing.provider && filing.lastError ? "Filing failed" : null,
        }}
        description={
          <>
            Keep a copy of every sent invoice and uploaded client document where the rest of your
            files live, in <code className="text-xs">Client / Invoices</code>,{" "}
            <code className="text-xs">Client / Documents</code> and{" "}
            <code className="text-xs">Client / Project / Documents</code> folders. Each item is filed
            when it happens; anything that fails is retried every hour.
          </>
        }
      />
      <CardContent className="flex flex-col gap-4">
        {filing.provider ? (
          <>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span>
                Filing to <strong>{LABELS[filing.provider]}</strong> → <strong>{filing.rootName}</strong>
                {filing.setUpBy ? <span className="text-muted-foreground"> (through {filing.setUpBy}&apos;s account)</span> : null}
              </span>
              {filing.rootUrl ? (
                <a href={filing.rootUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-brand hover:underline">
                  Open folder <ExternalLink className="size-3" />
                </a>
              ) : null}
            </div>
            {filing.lastError ? (
              <Alert variant="destructive">
                <AlertDescription>
                  {filing.lastError}
                  {readOnly ? null : " Once you've fixed the cause, this clears by itself the next time something files (within the hour), or click File everything now."}
                </AlertDescription>
              </Alert>
            ) : null}
            {readOnly ? null : (
              <form action={optionsAction} className="flex flex-wrap items-center gap-4">
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox name="fileInvoices" defaultChecked={filing.fileInvoices} /> Invoices (when sent; updated when paid or voided)
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox name="fileDocuments" defaultChecked={filing.fileDocuments} /> Uploaded documents
                </label>
                <SubmitButton size="sm" variant="outline" pendingText="Saving...">
                  Save
                </SubmitButton>
                {optionsState?.saved ? <span className="text-xs text-muted-foreground">Saved.</span> : null}
              </form>
            )}
            {readOnly ? null : (
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pending}
                  onClick={() =>
                    startTransition(async () => {
                      const r = await fileEverythingNowAction();
                      toast.success(r.filed ? `Filed ${r.filed} item${r.filed === 1 ? "" : "s"}.` : "Everything's already filed.");
                    })
                  }
                >
                  File everything now
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={pending}
                  onClick={() => {
                    if (confirm("Stop filing? Copies already filed stay where they are.")) {
                      startTransition(() => turnOffFilingAction());
                    }
                  }}
                >
                  Turn off
                </Button>
              </div>
            )}
          </>
        ) : readOnly ? (
          <p className="text-sm text-muted-foreground">Not set up.</p>
        ) : myConnections.length === 0 ? (
          <ol className="list-decimal space-y-1 pl-4 text-sm text-muted-foreground">
            <li>
              Connect Google Drive, Dropbox or OneDrive under{" "}
              <a href="/profile#files" className="text-brand hover:underline">Profile → Files &amp; docs</a>.
              Filing runs through the account of the owner or admin who sets it up.
            </li>
            <li>Come back here, pick the service and folder name, and click Set up filing.</li>
          </ol>
        ) : (
          <form action={setupAction} className="flex flex-col gap-3">
            {setupState?.error ? (
              <Alert variant="destructive">
                <AlertDescription>{setupState.error}</AlertDescription>
              </Alert>
            ) : null}
            <fieldset className="flex flex-wrap gap-4">
              <legend className="mb-2 text-sm font-medium">File to</legend>
              {myConnections.map((p, i) => (
                <label key={p} className="flex items-center gap-2 text-sm">
                  <input type="radio" name="provider" value={p} defaultChecked={i === 0} className="accent-[var(--primary)]" />
                  {LABELS[p]}
                </label>
              ))}
            </fieldset>
            <div className="flex max-w-sm flex-col gap-1.5">
              <Label htmlFor="rootName">Folder</Label>
              <Input id="rootName" name="rootName" defaultValue="Consultainer" />
              <p className="text-xs text-muted-foreground">
                Created at the top level of your own Drive, Dropbox or OneDrive (if it already exists
                there, it&apos;s reused). In Google Drive you can move it afterwards, e.g. into a shared
                drive; in Dropbox and OneDrive keep it where it is, or filing makes a new one.
              </p>
            </div>
            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2 text-sm">
                <Checkbox name="fileInvoices" defaultChecked /> Invoices
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox name="fileDocuments" defaultChecked /> Uploaded documents
              </label>
            </div>
            <div>
              <SubmitButton size="sm" pendingText="Setting up...">
                Set up filing
              </SubmitButton>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
