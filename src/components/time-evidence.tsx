"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { FileText, ImagePlus, Loader2, Paperclip, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  addTimeEntryAttachmentsAction,
  deleteTimeEntryAttachmentAction,
  setTimeEntryAttachmentVisibilityAction,
} from "@/actions/time-entry-attachments";

export type EvidenceItem = {
  id: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  clientVisible: boolean;
};

const ACCEPT = "image/png,image/jpeg,image/gif,image/webp,application/pdf";

function formatSize(bytes: number) {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** Files from a paste or drop that look like evidence. */
function evidenceFiles(list: FileList | null | undefined) {
  return Array.from(list ?? []).filter((f) => f.type.startsWith("image/") || f.type === "application/pdf");
}

/** Pasting anywhere while mounted (e.g. while a dialog is open) adds the
 * clipboard's screenshots. Text pastes are left alone. */
function usePastedFiles(onFiles: (files: File[]) => void) {
  const handler = useRef(onFiles);
  useEffect(() => {
    handler.current = onFiles;
  });
  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      const files = evidenceFiles(e.clipboardData?.files);
      if (files.length === 0) return;
      e.preventDefault();
      handler.current(files);
    }
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, []);
}

function DropZone({
  onFiles,
  busy,
  compact,
}: {
  onFiles: (files: File[]) => void;
  busy?: boolean;
  compact?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const files = evidenceFiles(e.dataTransfer.files);
        if (files.length) onFiles(files);
      }}
      className={cn(
        "flex items-center gap-3 rounded-md border border-dashed border-border px-3 text-sm text-muted-foreground transition-colors",
        compact ? "py-2" : "py-4",
        over && "border-primary bg-primary/5"
      )}
    >
      {busy ? <Loader2 className="size-4 shrink-0 animate-spin" /> : <ImagePlus className="size-4 shrink-0" />}
      <span className="min-w-0 flex-1">
        Paste a screenshot, drop files here, or{" "}
        <button
          type="button"
          className="font-medium text-foreground underline-offset-2 hover:underline"
          onClick={() => inputRef.current?.click()}
        >
          browse
        </button>
        .
      </span>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={ACCEPT}
        aria-label="Add evidence files"
        className="sr-only"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          if (files.length) onFiles(files);
        }}
      />
    </div>
  );
}

/**
 * Evidence chosen while logging or editing time; sent with the form as
 * "attachments" (and "attachmentsClientVisible").
 */
export function EvidencePicker({ error }: { error?: string }) {
  const [files, setFiles] = useState<File[]>([]);
  const fieldRef = useRef<HTMLInputElement>(null);

  // The form submits whatever the hidden input holds.
  useEffect(() => {
    if (!fieldRef.current) return;
    const transfer = new DataTransfer();
    files.forEach((f) => transfer.items.add(f));
    fieldRef.current.files = transfer.files;
  }, [files]);

  const add = (more: File[]) => setFiles((current) => [...current, ...more]);
  usePastedFiles(add);

  return (
    <div className="flex flex-col gap-2">
      <Label>Evidence (optional)</Label>
      <input ref={fieldRef} type="file" name="attachments" multiple hidden tabIndex={-1} aria-hidden />
      {files.length ? (
        <ul className="flex flex-col gap-1">
          {files.map((file, i) => (
            <li key={`${file.name}-${i}`} className="flex items-center gap-2 text-sm">
              {file.type === "application/pdf" ? (
                <FileText className="size-4 shrink-0 text-muted-foreground" />
              ) : (
                <Paperclip className="size-4 shrink-0 text-muted-foreground" />
              )}
              <span className="min-w-0 flex-1 truncate">{file.name}</span>
              <span className="shrink-0 text-xs text-muted-foreground">{formatSize(file.size)}</span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-6"
                aria-label={`Remove ${file.name}`}
                onClick={() => setFiles((current) => current.filter((_, j) => j !== i))}
              >
                <X className="size-3.5" />
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
      <DropZone onFiles={add} compact />
      {files.length ? (
        <div className="flex items-center gap-2">
          <Checkbox id="te-evidence-visible" name="attachmentsClientVisible" />
          <Label htmlFor="te-evidence-visible" className="text-sm font-normal">
            Let the client see {files.length === 1 ? "it" : "them"} on the invoice
          </Label>
        </div>
      ) : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}

/** The paperclip on a time entry: view, add, share or remove its evidence. */
export function EvidenceDialog({
  entryId,
  title,
  items,
  canEdit,
  clientSeesDetail,
}: {
  entryId: string;
  /** What the entry is, for the dialog's heading. */
  title: string;
  items: EvidenceItem[];
  canEdit: boolean;
  /** The client has "Show time detail on invoices" on. */
  clientSeesDetail: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  // Shown right away; the server catches up.
  const [visibleOverride, setVisibleOverride] = useState<Record<string, boolean>>({});

  function run(work: () => Promise<{ error: string } | null>) {
    startTransition(async () => {
      const result = await work();
      if (result?.error) toast.error(result.error);
    });
  }

  function upload(files: File[]) {
    const form = new FormData();
    files.forEach((f) => form.append("attachments", f));
    run(() => addTimeEntryAttachmentsAction(entryId, form));
  }

  if (!canEdit && items.length === 0) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size={items.length ? "sm" : "icon"}
          className={cn("h-7 gap-1 px-1.5 text-muted-foreground", !items.length && "size-7")}
          aria-label={items.length ? `Evidence (${items.length})` : "Add evidence"}
          title={items.length ? `${items.length} attachment${items.length === 1 ? "" : "s"}` : "Add evidence"}
        >
          <Paperclip className="size-3.5" />
          {items.length ? <span className="tabular-figures text-xs">{items.length}</span> : null}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Evidence</DialogTitle>
          <DialogDescription>{title}</DialogDescription>
        </DialogHeader>
        {open && canEdit ? <PasteToUpload onFiles={upload} /> : null}
        {items.length ? (
          <ul className="grid max-h-[60vh] grid-cols-1 gap-3 overflow-y-auto sm:grid-cols-2">
            {items.map((item) => {
              const href = `/api/time-entries/attachments/${item.id}`;
              return (
                <li key={item.id} className="flex flex-col overflow-hidden rounded-md border border-border">
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex h-36 items-center justify-center bg-muted/40"
                    title={`Open ${item.fileName}`}
                  >
                    {item.contentType.startsWith("image/") ? (
                      // eslint-disable-next-line @next/next/no-img-element -- private file served by our own route
                      <img src={href} alt={item.fileName} className="max-h-full max-w-full object-contain" />
                    ) : (
                      <FileText className="size-10 text-muted-foreground" />
                    )}
                  </a>
                  <div className="flex flex-col gap-2 p-2.5">
                    <div className="flex items-center gap-2">
                      <p className="min-w-0 flex-1 truncate text-sm" title={item.fileName}>
                        {item.fileName}
                      </p>
                      <span className="shrink-0 text-xs text-muted-foreground">{formatSize(item.sizeBytes)}</span>
                      {canEdit ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-7"
                          aria-label={`Delete ${item.fileName}`}
                          disabled={pending}
                          onClick={() => {
                            if (confirm(`Delete ${item.fileName}?`)) {
                              run(() => deleteTimeEntryAttachmentAction(item.id));
                            }
                          }}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id={`ev-visible-${item.id}`}
                        checked={visibleOverride[item.id] ?? item.clientVisible}
                        disabled={!canEdit}
                        onCheckedChange={(checked) => {
                          const visible = checked === true;
                          setVisibleOverride((current) => ({ ...current, [item.id]: visible }));
                          run(async () => {
                            const result = await setTimeEntryAttachmentVisibilityAction(item.id, visible);
                            if (result?.error) {
                              setVisibleOverride((current) => ({ ...current, [item.id]: !visible }));
                            }
                            return result;
                          });
                        }}
                      />
                      <Label htmlFor={`ev-visible-${item.id}`} className="text-xs font-normal">
                        Client can see it
                      </Label>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No evidence yet.</p>
        )}
        {canEdit ? <DropZone onFiles={upload} busy={pending} /> : null}
        <p className="text-xs text-muted-foreground">
          {clientSeesDetail
            ? "Files the client can see are linked from the time detail on their invoice once this entry is invoiced."
            : "Only your team sees these. To show them to the client, turn on “Show time detail on invoices” on the client."}
        </p>
      </DialogContent>
    </Dialog>
  );
}

function PasteToUpload({ onFiles }: { onFiles: (files: File[]) => void }) {
  usePastedFiles(onFiles);
  return null;
}
