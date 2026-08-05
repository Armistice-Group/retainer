"use client";

import { useActionState } from "react";
import { syncQuickBooksStatusAction } from "@/actions/invoices";
import { SubmitButton } from "@/components/forms/submit-button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { ActionState } from "@/actions/auth";

export function SyncQuickBooksStatusButton({ invoiceId }: { invoiceId: string }) {
  const action = syncQuickBooksStatusAction.bind(null, invoiceId);
  const [state, formAction] = useActionState<ActionState, FormData>(action, null);

  return (
    <div className="flex flex-col items-end gap-2">
      <form action={formAction}>
        <SubmitButton variant="outline" size="sm" pendingText="Checking...">
          Sync status from QuickBooks
        </SubmitButton>
      </form>
      {state?.error ? (
        <Alert variant="destructive" className="max-w-sm">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}
