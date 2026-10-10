"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/forms/submit-button";
import { setInvoiceStatusAction } from "@/actions/invoices";

/** Records a payment for the whole balance still due. */
export function MarkPaidDialog({ invoiceId, balanceLabel }: { invoiceId: string; balanceLabel: string }) {
  const [open, setOpen] = useState(false);
  const action = setInvoiceStatusAction.bind(null, invoiceId, "PAID");

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">Mark as paid</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Mark as paid</DialogTitle>
          <DialogDescription>
            Records a payment of {balanceLabel} received today — the whole balance due. For part of
            it, or another date, use Record payment.
          </DialogDescription>
        </DialogHeader>
        <form action={action} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="payment-method">Payment method (optional)</Label>
            <Input id="payment-method" name="paymentMethod" placeholder="e.g. Wire, ACH, Check" />
          </div>
          <SubmitButton pendingText="Saving...">Mark as paid</SubmitButton>
        </form>
      </DialogContent>
    </Dialog>
  );
}
