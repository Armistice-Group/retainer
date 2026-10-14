"use client";

import { useTransition } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { deleteTimeEntryAction } from "@/actions/time-entries";

export function DeleteEntryButton({ entryId, label }: { entryId: string; label: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="ghost"
      size="icon"
      className="size-7"
      aria-label="Delete time entry"
      title="Delete time entry"
      disabled={pending}
      onClick={() => {
        if (!confirm(`Delete ${label}?`)) return;
        startTransition(async () => {
          const result = await deleteTimeEntryAction(entryId);
          if (result?.error) toast.error(result.error);
          else toast.success(`Deleted ${label}`);
        });
      }}
    >
      <Trash2 className="size-3.5" />
    </Button>
  );
}
