"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileText, Paperclip, Plus, Share2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { TimeEntryDialog } from "@/app/(app)/time/time-entry-dialog";
import { addTimeEntryAttachmentsAction } from "@/actions/time-entry-attachments";

// Where public/sw.js keeps what was shared to the app.
const INBOX = "share-inbox";

type Entry = { id: string; day: string; project: string; detail: string; hours: number };
type DialogProps = Omit<React.ComponentProps<typeof TimeEntryDialog>, "initialEvidence" | "onSaved" | "trigger">;

async function readInbox(): Promise<File[]> {
  if (!("caches" in window)) return [];
  const cache = await caches.open(INBOX);
  const keys = await cache.keys();
  const files: File[] = [];
  for (const key of keys) {
    const res = await cache.match(key);
    if (!res) continue;
    const name = decodeURIComponent(res.headers.get("X-File-Name") ?? "Shared file");
    const blob = await res.blob();
    files.push(new File([blob], name, { type: res.headers.get("Content-Type") ?? blob.type }));
  }
  return files;
}

async function clearInbox() {
  if ("caches" in window) await caches.delete(INBOX);
}

/** Screenshots and PDFs shared to the app from Android's share sheet:
 * log new time with them, or add them to an entry you've already logged. */
export function ShareInbox({ entries, dialog }: { entries: Entry[]; dialog: DialogProps }) {
  const router = useRouter();
  const [files, setFiles] = useState<File[] | null>(null);
  const [previews, setPreviews] = useState<string[]>([]);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    let urls: string[] = [];
    readInbox()
      .then((found) => {
        urls = found.map((f) => (f.type.startsWith("image/") ? URL.createObjectURL(f) : ""));
        setPreviews(urls);
        setFiles(found);
      })
      .catch(() => setFiles([]));
    return () => urls.forEach((u) => u && URL.revokeObjectURL(u));
  }, []);

  function done(message: string) {
    toast.success(message);
    void clearInbox();
    setFiles([]);
    router.push("/m");
  }

  function attachTo(entry: Entry) {
    if (!files?.length) return;
    const form = new FormData();
    files.forEach((f) => form.append("attachments", f));
    startTransition(async () => {
      const result = await addTimeEntryAttachmentsAction(entry.id, form);
      if (result?.error) toast.error(result.error);
      else done(`Added to ${entry.project}, ${entry.day}`);
    });
  }

  if (files === null) return <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>;

  if (files.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-10 text-center">
        <Share2 className="size-8 text-muted-foreground" />
        <p className="font-medium">Nothing shared yet</p>
        <p className="max-w-xs text-sm text-muted-foreground">
          In any app, tap Share and pick Consultainer to send a screenshot or PDF here, then add it to your time as
          evidence. Install the app first (from Today) so it shows in the share sheet.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <section aria-label="Shared files">
        <h2 className="mb-2 text-sm font-medium">
          {files.length === 1 ? "1 file shared" : `${files.length} files shared`}
        </h2>
        <ul className="grid grid-cols-3 gap-2">
          {files.map((file, i) => (
            <li
              key={`${file.name}-${i}`}
              className="flex aspect-square flex-col items-center justify-center overflow-hidden rounded-lg border border-border bg-muted/40"
              title={file.name}
            >
              {previews[i] ? (
                // eslint-disable-next-line @next/next/no-img-element -- a local object URL
                <img src={previews[i]} alt={file.name} className="size-full object-cover" />
              ) : (
                <>
                  <FileText className="size-8 text-muted-foreground" />
                  <span className="mt-1 w-full truncate px-1 text-center text-xs">{file.name}</span>
                </>
              )}
            </li>
          ))}
        </ul>
        <Button
          variant="link"
          size="sm"
          className="mt-1 h-auto px-0 text-muted-foreground"
          onClick={async () => {
            await clearInbox();
            setFiles([]);
          }}
        >
          Discard
        </Button>
      </section>

      {dialog.projects.length ? (
        <TimeEntryDialog
          {...dialog}
          initialEvidence={files}
          onSaved={() => {
            void clearInbox();
            setFiles([]);
            router.push("/m");
          }}
          trigger={
            <Button className="h-12 text-base">
              <Plus className="size-4" /> Log new time with {files.length === 1 ? "it" : "them"}
            </Button>
          }
        />
      ) : null}

      <section aria-label="Add to an entry">
        <h2 className="mb-2 text-sm font-medium">Or add to time you logged</h2>
        {entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">No entries in the last two weeks.</p>
        ) : (
          <ul className="divide-y divide-border rounded-xl border border-border bg-card">
            {entries.map((entry) => (
              <li key={entry.id}>
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => attachTo(entry)}
                  className="flex w-full items-center gap-3 p-3 text-left hover:bg-muted/50 disabled:opacity-50"
                >
                  <Paperclip className="size-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{entry.project}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {entry.day}
                      {entry.detail ? ` · ${entry.detail}` : ""}
                    </span>
                  </span>
                  <span className="tabular-figures text-sm">{entry.hours.toFixed(2)}h</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
