"use client";

import Link from "next/link";
import { useActionState } from "react";
import { sendInvoiceAction, type SendInvoiceState } from "@/actions/invoices";
import { SubmitButton } from "@/components/forms/submit-button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export function SendInvoiceButton({ invoiceId }: { invoiceId: string }) {
  const action = sendInvoiceAction.bind(null, invoiceId);
  const [state, formAction] = useActionState<SendInvoiceState, FormData>(action, null);

  return (
    <div className="flex flex-col items-end gap-2">
      <form action={formAction}>
        <input type="hidden" name="override" value="false" />
        <SubmitButton size="sm" pendingText="Sending...">
          Mark as sent
        </SubmitButton>
      </form>

      {state?.error ? (
        <Alert variant="destructive" className="max-w-sm">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}

      {state?.blockers && state.blockers.length > 0 ? (
        <Alert variant="destructive" className="max-w-sm">
          <AlertDescription className="flex flex-col gap-2">
            <p>This invoice bills projects that haven&apos;t passed their AI Code Health scan:</p>
            <ul className="list-inside list-disc">
              {state.blockers.map((b) => (
                <li key={b.projectId}>
                  <Link href={`/projects/${b.projectId}`} className="underline">
                    {b.projectName}
                  </Link>{" "}
                  — {b.criticalCount} critical finding{b.criticalCount === 1 ? "" : "s"} (score{" "}
                  {b.score}/100)
                </li>
              ))}
            </ul>
            <form action={formAction}>
              <input type="hidden" name="override" value="true" />
              <Button type="submit" variant="outline" size="sm">
                Send anyway
              </Button>
            </form>
          </AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}
