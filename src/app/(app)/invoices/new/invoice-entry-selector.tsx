"use client";

import { useActionState, useMemo, useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SubmitButton } from "@/components/forms/submit-button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { generateInvoiceAction } from "@/actions/invoices";
import { formatCurrency, formatDate } from "@/lib/format";
import { addDays, toISODate } from "@/lib/date";
import type { ActionState } from "@/actions/auth";

const PAYMENT_TERMS_OPTIONS = [
  { value: "DUE_ON_RECEIPT", label: "Due on receipt", days: 0 },
  { value: "NET15", label: "Net 15", days: 15 },
  { value: "NET30", label: "Net 30", days: 30 },
  { value: "NET45", label: "Net 45", days: 45 },
  { value: "NET60", label: "Net 60", days: 60 },
  { value: "NET90", label: "Net 90", days: 90 },
  { value: "CUSTOM", label: "Custom", days: null },
] as const;

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

type EligibleMilestone = {
  id: string;
  name: string;
  projectName: string;
  amount: number;
  completedAt: string;
};

type EligibleExpense = {
  id: string;
  description: string;
  projectName: string;
  amount: number;
  incurredAt: string;
};

export function InvoiceEntrySelector({
  clientId,
  entries,
  milestones,
  expenses,
  currency,
  defaultTaxRate,
}: {
  clientId: string;
  entries: EligibleEntry[];
  milestones: EligibleMilestone[];
  expenses: EligibleExpense[];
  currency: string;
  defaultTaxRate: number;
}) {
  const [selectedEntries, setSelectedEntries] = useState<Set<string>>(
    new Set(entries.map((e) => e.id))
  );
  const [selectedMilestones, setSelectedMilestones] = useState<Set<string>>(
    new Set(milestones.map((m) => m.id))
  );
  const [selectedExpenses, setSelectedExpenses] = useState<Set<string>>(
    new Set(expenses.map((e) => e.id))
  );
  const [taxRate, setTaxRate] = useState(defaultTaxRate);
  const [state, formAction] = useActionState<ActionState, FormData>(generateInvoiceAction, null);

  const subtotal = useMemo(() => {
    const entriesTotal = entries
      .filter((e) => selectedEntries.has(e.id))
      .reduce((sum, e) => sum + e.amount, 0);
    const milestonesTotal = milestones
      .filter((m) => selectedMilestones.has(m.id))
      .reduce((sum, m) => sum + m.amount, 0);
    const expensesTotal = expenses
      .filter((e) => selectedExpenses.has(e.id))
      .reduce((sum, e) => sum + e.amount, 0);
    return entriesTotal + milestonesTotal + expensesTotal;
  }, [entries, selectedEntries, milestones, selectedMilestones, expenses, selectedExpenses]);
  const taxAmount = Math.round(subtotal * (taxRate / 100) * 100) / 100;
  const total = subtotal + taxAmount;

  function toggleEntry(id: string) {
    setSelectedEntries((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAllEntries() {
    setSelectedEntries((prev) =>
      prev.size === entries.length ? new Set() : new Set(entries.map((e) => e.id))
    );
  }

  function toggleMilestone(id: string) {
    setSelectedMilestones((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAllMilestones() {
    setSelectedMilestones((prev) =>
      prev.size === milestones.length ? new Set() : new Set(milestones.map((m) => m.id))
    );
  }

  function toggleExpense(id: string) {
    setSelectedExpenses((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAllExpenses() {
    setSelectedExpenses((prev) =>
      prev.size === expenses.length ? new Set() : new Set(expenses.map((e) => e.id))
    );
  }

  const [today] = useState(() => toISODate(new Date()));
  const [in30] = useState(() => toISODate(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)));
  const [issueDate, setIssueDate] = useState(today);
  const [paymentTerms, setPaymentTerms] =
    useState<(typeof PAYMENT_TERMS_OPTIONS)[number]["value"]>("NET30");
  const [dueDate, setDueDate] = useState(in30);

  function computeDueDate(issue: string, terms: (typeof PAYMENT_TERMS_OPTIONS)[number]["value"]) {
    const days = PAYMENT_TERMS_OPTIONS.find((t) => t.value === terms)?.days;
    if (days == null || !issue) return null;
    return toISODate(addDays(new Date(`${issue}T00:00:00`), days));
  }

  function handleIssueDateChange(value: string) {
    setIssueDate(value);
    const computed = computeDueDate(value, paymentTerms);
    if (computed) setDueDate(computed);
  }

  function handlePaymentTermsChange(value: (typeof PAYMENT_TERMS_OPTIONS)[number]["value"]) {
    setPaymentTerms(value);
    const computed = computeDueDate(issueDate, value);
    if (computed) setDueDate(computed);
  }

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <input type="hidden" name="clientId" value={clientId} />
      {state?.error ? (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}

      {entries.length > 0 ? (
        <Card className="p-0">
          <div className="flex items-center gap-3 border-b border-border px-4 py-2.5">
            <Checkbox
              checked={selectedEntries.size === entries.length}
              onCheckedChange={toggleAllEntries}
              aria-label="Select all time entries"
            />
            <span className="text-sm font-medium">
              {selectedEntries.size} of {entries.length} time entries selected
            </span>
          </div>
          <ul className="divide-y divide-border">
            {entries.map((entry) => (
              <li key={entry.id} className="flex items-center gap-3 px-4 py-3">
                <Checkbox
                  checked={selectedEntries.has(entry.id)}
                  onCheckedChange={() => toggleEntry(entry.id)}
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
      ) : null}

      {milestones.length > 0 ? (
        <Card className="p-0">
          <div className="flex items-center gap-3 border-b border-border px-4 py-2.5">
            <Checkbox
              checked={selectedMilestones.size === milestones.length}
              onCheckedChange={toggleAllMilestones}
              aria-label="Select all milestones"
            />
            <span className="text-sm font-medium">
              {selectedMilestones.size} of {milestones.length} completed milestones selected
            </span>
          </div>
          <ul className="divide-y divide-border">
            {milestones.map((milestone) => (
              <li key={milestone.id} className="flex items-center gap-3 px-4 py-3">
                <Checkbox
                  checked={selectedMilestones.has(milestone.id)}
                  onCheckedChange={() => toggleMilestone(milestone.id)}
                  name="milestoneIds"
                  value={milestone.id}
                />
                <div className="min-w-0 flex-1 text-sm">
                  <p className="truncate font-medium">{milestone.name}</p>
                  <p className="truncate text-muted-foreground">
                    {milestone.projectName} · Completed {formatDate(milestone.completedAt)}
                  </p>
                </div>
                <span className="tabular-figures w-24 shrink-0 text-right text-sm font-medium">
                  {formatCurrency(milestone.amount, currency)}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {expenses.length > 0 ? (
        <Card className="p-0">
          <div className="flex items-center gap-3 border-b border-border px-4 py-2.5">
            <Checkbox
              checked={selectedExpenses.size === expenses.length}
              onCheckedChange={toggleAllExpenses}
              aria-label="Select all expenses"
            />
            <span className="text-sm font-medium">
              {selectedExpenses.size} of {expenses.length} approved expenses selected
            </span>
          </div>
          <ul className="divide-y divide-border">
            {expenses.map((expense) => (
              <li key={expense.id} className="flex items-center gap-3 px-4 py-3">
                <Checkbox
                  checked={selectedExpenses.has(expense.id)}
                  onCheckedChange={() => toggleExpense(expense.id)}
                  name="expenseIds"
                  value={expense.id}
                />
                <div className="min-w-0 flex-1 text-sm">
                  <p className="truncate font-medium">{expense.description}</p>
                  <p className="truncate text-muted-foreground">
                    {expense.projectName} · {formatDate(expense.incurredAt)}
                  </p>
                </div>
                <span className="tabular-figures w-24 shrink-0 text-right text-sm font-medium">
                  {formatCurrency(expense.amount, currency)}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <div className="grid gap-5 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="issueDate">Issue date</Label>
          <Input
            id="issueDate"
            name="issueDate"
            type="date"
            value={issueDate}
            onChange={(e) => handleIssueDateChange(e.target.value)}
            required
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="paymentTerms">Payment terms</Label>
          <Select name="paymentTerms" value={paymentTerms} onValueChange={handlePaymentTermsChange}>
            <SelectTrigger id="paymentTerms" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAYMENT_TERMS_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
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
            onChange={(e) => setDueDate(e.target.value)}
            required
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="poNumber">PO number (optional)</Label>
          <Input id="poNumber" name="poNumber" placeholder="e.g. PO-4821" />
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
          <Textarea id="notes" name="notes" rows={3} placeholder="Thank-you note, remittance info, etc." />
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
        disabled={
          selectedEntries.size === 0 && selectedMilestones.size === 0 && selectedExpenses.size === 0
        }
      >
        Generate invoice
      </SubmitButton>
    </form>
  );
}
