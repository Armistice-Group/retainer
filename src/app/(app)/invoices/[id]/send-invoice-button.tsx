"use client";

import { useActionState, useState } from "react";
import { sendInvoiceAction, type SendInvoiceState } from "@/actions/invoices";
import { SubmitButton } from "@/components/forms/submit-button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";

/** Marks a draft as sent without sending anything, after a check: a sent
 * invoice's lines can't be changed. */
export function SendInvoiceButton({ invoiceId, invoiceNumber }: { invoiceId: string; invoiceNumber: string }) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState<SendInvoiceState, FormData>(async (prev, formData) => {
    const result = await sendInvoiceAction(invoiceId, prev, formData);
    if (!result?.error) {
      setOpen(false);
      toast.success(`${invoiceNumber} marked as sent.`);
    }
    return result;
  }, null);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          Mark as sent
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Mark {invoiceNumber} as sent?</DialogTitle>
          <DialogDescription>
            For an invoice you&apos;ve sent some other way. Nothing is emailed. Once it&apos;s sent its
            lines and dates can&apos;t be changed; to fix a mistake you&apos;d void it and make a new one.
          </DialogDescription>
        </DialogHeader>
        {state?.error ? (
          <Alert variant="destructive">
            <AlertDescription>{state.error}</AlertDescription>
          </Alert>
        ) : null}
        <form action={formAction}>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <SubmitButton pendingText="Marking...">Mark as sent</SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
