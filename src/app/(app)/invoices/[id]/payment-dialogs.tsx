"use client";

import { useActionState, useState, useTransition } from "react";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SubmitButton } from "@/components/forms/submit-button";
import { applyCreditAction, recordPaymentAction, type LedgerActionResult } from "@/actions/payments";
import type { ActionState } from "@/actions/auth";

const money = (amount: number, currency: string) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount);

const today = () => new Date().toISOString().slice(0, 10);

/** Record a payment (part or all of the balance). Owners and admins only. */
export function RecordPaymentDialog({
  invoiceId,
  balance,
  currency,
}: {
  invoiceId: string;
  balance: number;
  currency: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState<ActionState, FormData>(async (prev, formData) => {
    const result = await recordPaymentAction(invoiceId, prev, formData);
    if (result?.saved) {
      setOpen(false);
      toast.success("Payment recorded.");
    }
    return result;
  }, null);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          Record payment
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Record payment</DialogTitle>
          <DialogDescription>
            {money(balance, currency)} is due. Record part of it and the invoice stays open with
            the rest due; record all of it and it&apos;s marked paid.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="flex flex-col gap-4">
          {state?.error ? (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          ) : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="payment-amount">Amount ({currency})</Label>
              <Input
                id="payment-amount"
                name="amount"
                type="number"
                step="0.01"
                min="0.01"
                max={balance.toFixed(2)}
                defaultValue={balance.toFixed(2)}
                required
                className="tabular-figures"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="payment-date">Received on</Label>
              <Input id="payment-date" name="receivedAt" type="date" defaultValue={today()} required />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="payment-method-field">Method (optional)</Label>
              <Input id="payment-method-field" name="method" placeholder="e.g. Wire, ACH, Check" />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="payment-reference">Reference (optional)</Label>
              <Input id="payment-reference" name="reference" placeholder="e.g. check number" />
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="payment-note">Note (optional)</Label>
            <Textarea id="payment-note" name="note" rows={2} />
          </div>
          <SubmitButton pendingText="Saving...">Record payment</SubmitButton>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Spend the client's available credit on this invoice. */
export function ApplyCreditDialog({
  invoiceId,
  balance,
  available,
  currency,
}: {
  invoiceId: string;
  balance: number;
  available: number;
  currency: string;
}) {
  const [open, setOpen] = useState(false);
  const suggested = Math.min(balance, available);
  const [state, formAction] = useActionState<ActionState, FormData>(async (prev, formData) => {
    const result = await applyCreditAction(invoiceId, prev, formData);
    if (result?.saved) {
      setOpen(false);
      toast.success("Credit applied.");
    }
    return result;
  }, null);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          Apply credit
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Apply client credit</DialogTitle>
          <DialogDescription>
            This client has {money(available, currency)} of credit from deposits, credit notes or
            overpayments. Applying it lowers what&apos;s due here ({money(balance, currency)}).
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="flex flex-col gap-4">
          {state?.error ? (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          ) : null}
          <div className="flex flex-col gap-2">
            <Label htmlFor="credit-amount">Amount ({currency})</Label>
            <Input
              id="credit-amount"
              name="amount"
              type="number"
              step="0.01"
              min="0.01"
              max={suggested.toFixed(2)}
              defaultValue={suggested.toFixed(2)}
              required
              className="tabular-figures"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="credit-note-field">Note (optional)</Label>
            <Input id="credit-note-field" name="note" placeholder="e.g. Deposit from INV-0012" />
          </div>
          <SubmitButton pendingText="Applying...">Apply credit</SubmitButton>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** A confirm-then-run button for removing a payment or applied credit (or
 * voiding a credit note), showing why it couldn't be done instead of an
 * error page. */
export function LedgerActionButton({
  action,
  confirmMessage,
  label,
  doneMessage,
}: {
  action: () => Promise<LedgerActionResult>;
  confirmMessage: string;
  label: string;
  doneMessage: string;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="ghost"
      size="icon"
      className="size-7 shrink-0"
      aria-label={label}
      title={label}
      disabled={pending}
      onClick={() => {
        if (!window.confirm(confirmMessage)) return;
        startTransition(async () => {
          const result = await action();
          if (result.error) toast.error(result.error);
          else toast.success(doneMessage);
        });
      }}
    >
      <Trash2 className="size-3.5" />
    </Button>
  );
}
