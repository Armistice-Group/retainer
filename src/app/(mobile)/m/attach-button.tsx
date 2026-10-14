"use client";

import { useRef, useTransition } from "react";
import { Camera, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { addTimeEntryAttachmentsAction } from "@/actions/time-entry-attachments";

/** Adds a photo, screenshot or PDF to an entry. On Android the picker
 * offers the camera, the gallery and files. */
export function AttachButton({ entryId, label }: { entryId: string; label: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [isPending, startTransition] = useTransition();

  function upload(files: File[]) {
    if (!files.length) return;
    const form = new FormData();
    files.forEach((f) => form.append("attachments", f));
    startTransition(async () => {
      const result = await addTimeEntryAttachmentsAction(entryId, form);
      if (result?.error) toast.error(result.error);
      else toast.success(files.length === 1 ? "Evidence added" : `${files.length} files added`);
    });
  }

  return (
    <>
      <input
        ref={input}
        type="file"
        accept="image/*,application/pdf"
        multiple
        hidden
        onChange={(e) => {
          upload(Array.from(e.target.files ?? []));
          e.target.value = "";
        }}
      />
      <Button
        variant="ghost"
        size="icon"
        className="size-9"
        aria-label={`Add a photo to ${label}`}
        disabled={isPending}
        onClick={() => input.current?.click()}
      >
        {isPending ? <Loader2 className="size-4 animate-spin" /> : <Camera className="size-4" />}
      </Button>
    </>
  );
}
