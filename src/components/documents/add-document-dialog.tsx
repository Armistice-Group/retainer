"use client";

import { useActionState, useState } from "react";
import { Link2, Plus, Upload } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SubmitButton } from "@/components/forms/submit-button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { addClientDocumentAction } from "@/actions/client-documents";
import { detectLink } from "@/lib/integrations/storage/detect";
import { detectAgreementUrl } from "@/lib/integrations/agreements/detect";
import { AGREEMENT_PROVIDER_LABELS } from "@/lib/integrations/agreements/parse";
import { DocumentAccessFields, type DocumentMember } from "./document-access-fields";
import { DocumentAudienceField } from "./document-audience-field";
import { DocumentIcon } from "./provider-icon";
import { DOCUMENT_TYPES } from "./document-types";
import { LinkPicker } from "./link-picker";
import { cn } from "@/lib/utils";
import type { ActionState } from "@/actions/auth";

export function AddDocumentDialog({
  clientId,
  projectId,
  projects,
  members,
  viewerId,
  uploadLimitMb,
  providers,
}: {
  clientId: string;
  /** Adding from a project page: fixed to that project. */
  projectId?: string;
  /** Adding from a client page: which project it's for, if any. */
  projects?: { id: string; name: string }[];
  members: DocumentMember[];
  viewerId: string;
  uploadLimitMb: number;
  /** Providers the viewer has connected, to browse and pick from. */
  providers: string[];
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"link" | "upload">("link");
  const [url, setUrl] = useState("");
  const [label, setLabel] = useState("");
  const detected = url ? detectLink(url) : null;
  const agreementLink = url ? detectAgreementUrl(url) : null;
  const [state, formAction] = useActionState<ActionState, FormData>(async (prev, formData) => {
    const result = await addClientDocumentAction(clientId, prev, formData);
    if (result?.saved) {
      setOpen(false);
      setUrl("");
      setLabel("");
    }
    return result;
  }, null);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Plus className="size-3.5" /> Add
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add a document</DialogTitle>
        </DialogHeader>
        <div className="inline-flex self-start rounded-md border border-border p-0.5" role="tablist">
          {(
            [
              ["link", "Link", Link2],
              ["upload", "Upload", Upload],
            ] as const
          ).map(([value, text, Icon]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={mode === value}
              onClick={() => setMode(value)}
              className={cn(
                "flex items-center gap-1.5 rounded px-2.5 py-1 text-sm",
                mode === value ? "bg-accent font-medium" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className="size-3.5" /> {text}
            </button>
          ))}
        </div>

        <form action={formAction} className="flex flex-col gap-4">
          {state?.error ? (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          ) : null}
          {projectId ? <input type="hidden" name="projectId" value={projectId} /> : null}

          {mode === "link" ? (
            <>
              {providers.length ? (
                <LinkPicker
                  providers={providers}
                  onPick={(pickedUrl, title) => {
                    setUrl(pickedUrl);
                    setLabel(title);
                  }}
                />
              ) : (
                <p className="text-xs text-muted-foreground">
                  Tip: connect Google Drive, Dropbox, OneDrive or Notion under{" "}
                  <a href="/profile#files" className="text-brand hover:underline">
                    Profile → Files &amp; docs
                  </a>{" "}
                  to browse and search them here instead of pasting links.
                </p>
              )}
              <div className="flex flex-col gap-2">
                <Label htmlFor="doc-url">Link</Label>
                <Input
                  id="doc-url"
                  name="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="Google Drive, Dropbox, OneDrive, Notion, Box, or any URL"
                  required
                />
                {agreementLink ? (
                  <p className="text-xs text-muted-foreground">
                    {AGREEMENT_PROVIDER_LABELS[agreementLink.provider]} agreement. For owners and
                    admins this links the signed agreement itself (it shows under Signed
                    agreements, with its signers and signed copy) through your organization&apos;s{" "}
                    {AGREEMENT_PROVIDER_LABELS[agreementLink.provider]} connection.
                  </p>
                ) : detected ? (
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <DocumentIcon source={detected.provider} kind={detected.kind} className="size-3.5" />
                    {detected.label}
                    {detected.kind ? ` ${detected.kind}` : ""}
                    {detected.title && !label ? ` · “${detected.title}”` : ""}
                  </p>
                ) : url ? (
                  <p className="text-xs text-destructive">Paste a full link, starting with https://.</p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    The file stays where it is. People open it there, so they (and the client, if
                    you share it with them) need access in that service too.
                  </p>
                )}
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="doc-label">Title</Label>
                <Input
                  id="doc-label"
                  name="label"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="Optional — taken from the file when we can"
                />
              </div>
            </>
          ) : (
            <>
              <div className="flex flex-col gap-2">
                <Label htmlFor="doc-file">File</Label>
                <input
                  id="doc-file"
                  type="file"
                  name="file"
                  required
                  // Matches what services/documents.ts takes.
                  accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.csv,.docx,.xlsx,.pptx"
                  className="text-sm file:mr-3 file:rounded-md file:border file:border-border file:bg-background file:px-3 file:py-1.5 file:text-sm file:font-medium file:hover:bg-muted"
                />
                <p className="text-xs text-muted-foreground">
                  PDF, PNG, JPEG, WebP, Word (.docx), Excel (.xlsx), PowerPoint (.pptx), text or CSV,
                  up to {uploadLimitMb}MB. Link bigger files or other types instead.
                </p>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="doc-upload-label">Title</Label>
                <Input id="doc-upload-label" name="label" placeholder="Optional, e.g. 2026 W-9" />
              </div>
            </>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="doc-type">Type</Label>
              <Select name="type" defaultValue="OTHER">
                <SelectTrigger id="doc-type" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DOCUMENT_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {projects && projects.length ? (
              <div className="flex flex-col gap-2">
                <Label htmlFor="doc-project">Project</Label>
                <Select name="projectId" defaultValue="">
                  <SelectTrigger id="doc-project" className="w-full">
                    <SelectValue placeholder="Whole client" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value=" ">Whole client</SelectItem>
                    {projects.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
          </div>

          <DocumentAudienceField idPrefix="new-doc" />
          <DocumentAccessFields members={members} viewerId={viewerId} idPrefix="new-doc" />

          <SubmitButton pendingText={mode === "link" ? "Adding..." : "Uploading..."}>
            {mode === "link" ? "Add link" : "Upload"}
          </SubmitButton>
        </form>
      </DialogContent>
    </Dialog>
  );
}
