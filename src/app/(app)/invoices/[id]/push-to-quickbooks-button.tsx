"use client";

import { useActionState } from "react";
import { pushToQuickBooksAction } from "@/actions/invoices";
import { SubmitButton } from "@/components/forms/submit-button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { ActionState } from "@/actions/auth";

export function PushToQuickBooksButton({
  invoiceId,
  alreadySynced,
}: {
  invoiceId: string;
  alreadySynced: boolean;
}) {
  const action = pushToQuickBooksAction.bind(null, invoiceId);
  const [state, formAction] = useActionState<ActionState, FormData>(action, null);

  return (
    <div className="flex flex-col items-end gap-2">
      <form action={formAction}>
        <SubmitButton variant="outline" size="sm" pendingText="Pushing...">
          {alreadySynced ? "Re-push to QuickBooks" : "Push to QuickBooks"}
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
