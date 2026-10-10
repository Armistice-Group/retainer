"use client";

import { useActionState } from "react";
import { ConfirmSubmitButton } from "@/components/forms/confirm-submit-button";
import { undoImportAction, type UndoImportState } from "@/actions/data-import";

export function UndoImportForm({ batchId, entries }: { batchId: string; entries: number }) {
  const [state, formAction] = useActionState<UndoImportState, FormData>(undoImportAction, null);
  return (
    <form action={formAction} className="flex flex-col items-end gap-1">
      <input type="hidden" name="batchId" value={batchId} />
      <ConfirmSubmitButton
        variant="outline"
        size="sm"
        confirmMessage={`Delete the ${entries} time entries this import created, and the clients and projects it added that nothing else uses?`}
      >
        Undo
      </ConfirmSubmitButton>
      {state?.error ? <p className="max-w-xs text-right text-xs text-destructive">{state.error}</p> : null}
      {state?.message ? <p className="max-w-xs text-right text-xs text-muted-foreground">{state.message}</p> : null}
    </form>
  );
}
