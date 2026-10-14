"use client";

import { useActionState, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SubmitButton } from "@/components/forms/submit-button";
import { useActionFeedback } from "@/components/forms/use-action-feedback";
import { updateInvoiceMetaAction } from "@/actions/invoices";
import { dueDateFor, PAYMENT_TERMS_OPTIONS } from "@/lib/payment-terms";
import type { ActionState } from "@/actions/auth";

/** A draft's dates, terms, PO, tax and notes. Changing the issue date or
 * terms moves the due date to match (Custom leaves it to you). */
export function InvoiceDetailsForm({
  invoiceId,
  values,
}: {
  invoiceId: string;
  values: {
    issueDate: string;
    dueDate: string;
    paymentTerms: string;
    poNumber: string;
    taxRate: string;
    notes: string;
  };
}) {
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(
    updateInvoiceMetaAction.bind(null, invoiceId),
    null
  );
  useActionFeedback(state, isPending, "Details saved");
  const [issueDate, setIssueDate] = useState(values.issueDate);
  const [terms, setTerms] = useState(values.paymentTerms);
  const [dueDate, setDueDate] = useState(values.dueDate);
  const errors = state?.fieldErrors ?? {};

  const retime = (nextIssue: string, nextTerms: string) => {
    const due = dueDateFor(nextIssue, nextTerms);
    if (due) setDueDate(due);
  };

  return (
    <form action={formAction} className="grid gap-4 sm:grid-cols-2">
      {state?.error ? (
        <Alert variant="destructive" className="sm:col-span-2">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}
      <div className="flex flex-col gap-2">
        <Label htmlFor="issueDate">Issue date</Label>
        <Input
          id="issueDate"
          name="issueDate"
          type="date"
          value={issueDate}
          onChange={(e) => {
            setIssueDate(e.target.value);
            retime(e.target.value, terms);
          }}
          required
        />
        {errors.issueDate ? <p className="text-sm text-destructive">{errors.issueDate[0]}</p> : null}
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="paymentTerms">Payment terms</Label>
        <Select
          name="paymentTerms"
          value={terms}
          onValueChange={(v) => {
            setTerms(v);
            retime(issueDate, v);
          }}
        >
          <SelectTrigger id="paymentTerms" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PAYMENT_TERMS_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="dueDate">Due date</Label>
        <Input
          id="dueDate"
          name="dueDate"
          type="date"
          value={dueDate}
          min={issueDate}
          onChange={(e) => {
            setDueDate(e.target.value);
            // A date that doesn't match the terms makes them Custom.
            if (e.target.value !== dueDateFor(issueDate, terms)) setTerms("CUSTOM");
          }}
          required
        />
        {errors.dueDate ? <p className="text-sm text-destructive">{errors.dueDate[0]}</p> : null}
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="poNumber">PO number</Label>
        <Input id="poNumber" name="poNumber" placeholder="e.g. 4821" defaultValue={values.poNumber} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="taxRate">Tax rate (%)</Label>
        <Input
          id="taxRate"
          name="taxRate"
          type="number"
          step="0.01"
          min="0"
          max="100"
          defaultValue={values.taxRate}
          required
        />
        {errors.taxRate ? <p className="text-sm text-destructive">{errors.taxRate[0]}</p> : null}
      </div>
      <div className="flex flex-col gap-2 sm:col-span-2">
        <Label htmlFor="notes">Notes</Label>
        <Textarea id="notes" name="notes" rows={3} defaultValue={values.notes} />
      </div>
      <div>
        <SubmitButton size="sm" pendingText="Saving...">
          Save details
        </SubmitButton>
      </div>
    </form>
  );
}
