"use client";

import { useActionState, useMemo, useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { SubmitButton } from "@/components/forms/submit-button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { generateInvoiceAction } from "@/actions/invoices";
import { formatCurrency, formatDate } from "@/lib/format";
import { toISODate } from "@/lib/date";
import type { ActionState } from "@/actions/auth";

type EligibleEntry = {
  id: string;
  date: string;
  hours: number;
  description: string | null;
  projectName: string;
  userName: string;
  rate: number;
  amount: number;
};

export function InvoiceEntrySelector({
  clientId,
  entries,
  currency,
  defaultTaxRate,
}: {
  clientId: string;
  entries: EligibleEntry[];
  currency: string;
  defaultTaxRate: number;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set(entries.map((e) => e.id)));
  const [taxRate, setTaxRate] = useState(defaultTaxRate);
  const [state, formAction] = useActionState<ActionState, FormData>(generateInvoiceAction, null);

  const subtotal = useMemo(
    () => entries.filter((e) => selected.has(e.id)).reduce((sum, e) => sum + e.amount, 0),
    [entries, selected]
  );
  const taxAmount = Math.round(subtotal * (taxRate / 100) * 100) / 100;
  const total = subtotal + taxAmount;

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) => (prev.size === entries.length ? new Set() : new Set(entries.map((e) => e.id))));
  }

  const [today] = useState(() => toISODate(new Date()));
  const [in30] = useState(() => toISODate(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)));

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <input type="hidden" name="clientId" value={clientId} />
      {state?.error ? (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}

      <Card className="p-0">
        <div className="flex items-center gap-3 border-b border-border px-4 py-2.5">
          <Checkbox
            checked={selected.size === entries.length}
            onCheckedChange={toggleAll}
            aria-label="Select all"
          />
          <span className="text-sm font-medium">
            {selected.size} of {entries.length} entries selected
          </span>
        </div>
        <ul className="divide-y divide-border">
          {entries.map((entry) => (
            <li key={entry.id} className="flex items-center gap-3 px-4 py-3">
              <Checkbox
                checked={selected.has(entry.id)}
                onCheckedChange={() => toggle(entry.id)}
                name="timeEntryIds"
                value={entry.id}
              />
              <div className="min-w-0 flex-1 text-sm">
                <p className="truncate font-medium">{entry.projectName}</p>
                <p className="truncate text-muted-foreground">
                  {entry.userName} · {formatDate(entry.date)}
                  {entry.description ? ` · ${entry.description}` : ""}
                </p>
              </div>
              <span className="tabular-figures shrink-0 text-sm text-muted-foreground">
                {entry.hours.toFixed(2)}h × {formatCurrency(entry.rate, currency)}
              </span>
              <span className="tabular-figures w-24 shrink-0 text-right text-sm font-medium">
                {formatCurrency(entry.amount, currency)}
              </span>
            </li>
          ))}
        </ul>
      </Card>

      <div className="grid gap-5 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="issueDate">Issue date</Label>
          <Input id="issueDate" name="issueDate" type="date" defaultValue={today} required />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="dueDate">Due date</Label>
          <Input id="dueDate" name="dueDate" type="date" defaultValue={in30} required />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="taxRate">Tax rate (%)</Label>
          <Input
            id="taxRate"
            name="taxRate"
            type="number"
            step="0.01"
            min="0"
            value={taxRate}
            onChange={(e) => setTaxRate(Number(e.target.value))}
          />
        </div>
        <div className="flex flex-col gap-2 sm:col-span-2">
          <Label htmlFor="notes">Notes</Label>
          <Textarea id="notes" name="notes" rows={3} placeholder="Payment terms, thank-you note, etc." />
        </div>
      </div>

      <div className="flex flex-col gap-1 self-end text-right">
        <div className="flex justify-between gap-8 text-sm text-muted-foreground">
          <span>Subtotal</span>
          <span className="tabular-figures">{formatCurrency(subtotal, currency)}</span>
        </div>
        <div className="flex justify-between gap-8 text-sm text-muted-foreground">
          <span>Tax</span>
          <span className="tabular-figures">{formatCurrency(taxAmount, currency)}</span>
        </div>
        <div className="flex justify-between gap-8 text-base font-semibold">
          <span>Total</span>
          <span className="tabular-figures">{formatCurrency(total, currency)}</span>
        </div>
      </div>

      <SubmitButton
        className="self-end"
        pendingText="Generating..."
        disabled={selected.size === 0}
      >
        Generate invoice
      </SubmitButton>
    </form>
  );
}
