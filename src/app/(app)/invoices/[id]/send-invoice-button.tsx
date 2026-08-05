"use client";

import { useActionState } from "react";
import { sendInvoiceAction, type SendInvoiceState } from "@/actions/invoices";
import { SubmitButton } from "@/components/forms/submit-button";
import { Alert, AlertDescription } from "@/components/ui/alert";

export function SendInvoiceButton({ invoiceId }: { invoiceId: string }) {
  const action = sendInvoiceAction.bind(null, invoiceId);
  const [state, formAction] = useActionState<SendInvoiceState, FormData>(action, null);

  return (
    <div className="flex flex-col items-end gap-2">
      <form action={formAction}>
        <SubmitButton size="sm" pendingText="Sending...">
          Mark as sent
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
