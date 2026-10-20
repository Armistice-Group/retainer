"use client";

import { useActionState, useState, useTransition, type FormEvent } from "react";
import { Plus, X } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SubmitButton } from "@/components/forms/submit-button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { createCustomInvoiceAction } from "@/actions/invoices";
import { formatCurrency } from "@/lib/format";
import { toISODate } from "@/lib/date";
import {
  PAYMENT_TERMS_OPTIONS,
  dueDateFor,
  paymentTermsLabel,
  type PaymentTermsValue,
} from "@/lib/payment-terms";
import type { ActionState } from "@/actions/auth";

const NONE = "none";
const amountOf = (raw: string) => {
  const n = Number(raw.replace(/[,\s$]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : 0;
};

/**
 * An invoice for amounts typed in rather than logged work: a set fee, a
 * retainer, or a deposit ("Initial deposit", $500). Each line is a
 * description and an amount.
 */
export function CustomInvoiceForm({
  clientId,
  projects,
  currency,
  defaultTaxRate,
  clientTerms,
  canDeposit,
}: {
  clientId: string;
  projects: { id: string; name: string; paymentTerms: PaymentTermsValue | null }[];
  currency: string;
  defaultTaxRate: number;
  /** The client's default terms (or the org's when it has none). */
  clientTerms: PaymentTermsValue;
  /** Owners and admins: deposits become client credit. */
  canDeposit: boolean;
}) {
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(createCustomInvoiceAction, null);
  const [, startTransition] = useTransition();
  const [lines, setLines] = useState([{ key: 0, description: "", amount: "" }]);
  const [nextKey, setNextKey] = useState(1);
  const [deposit, setDeposit] = useState(false);
  const [projectId, setProjectId] = useState(NONE);
  const [taxRate, setTaxRate] = useState(String(defaultTaxRate));
  const [today] = useState(() => toISODate(new Date()));
  const [issueDate, setIssueDate] = useState(today);
  const [termsOverride, setTermsOverride] = useState<PaymentTermsValue | null>(null);
  const [dueOverride, setDueOverride] = useState<string | null>(null);

  const project = projects.find((p) => p.id === projectId);
  const autoTerms = project?.paymentTerms || clientTerms;
  const paymentTerms = termsOverride ?? autoTerms;
  const dueDate = dueOverride ?? dueDateFor(issueDate, paymentTerms) ?? issueDate;

  const subtotal = lines.reduce((sum, l) => sum + amountOf(l.amount), 0);
  const rate = deposit ? 0 : Number(taxRate) || 0;
  const taxAmount = Math.round(subtotal * rate) / 100;
  const total = subtotal + taxAmount;

  const setLine = (key: number, patch: Partial<{ description: string; amount: string }>) =>
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  // Submitting by hand keeps what was typed when the server refuses it.
  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    startTransition(() => formAction(data));
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6">
      <input type="hidden" name="clientId" value={clientId} />
      {state?.error ? (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}

      <Card className="flex flex-col gap-3 p-4">
        <div className="hidden gap-3 text-xs font-medium text-muted-foreground sm:flex">
          <span className="flex-1">Description</span>
          <span className="w-36">Amount ({currency})</span>
          <span className="w-8" />
        </div>
        {lines.map((line, i) => (
          <div key={line.key} className="flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-3">
            <Input
              name="lineDescription"
              aria-label={`Line ${i + 1} description`}
              placeholder={i === 0 ? "e.g. Initial deposit" : "Description"}
              value={line.description}
              onChange={(e) => setLine(line.key, { description: e.target.value })}
              maxLength={500}
              className="sm:flex-1"
              required
            />
            <div className="flex items-center gap-2">
              <Input
                name="lineAmount"
                aria-label={`Line ${i + 1} amount`}
                inputMode="decimal"
                placeholder="500.00"
                value={line.amount}
                onChange={(e) => setLine(line.key, { amount: e.target.value })}
                className="tabular-figures w-full sm:w-36"
                required
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-8 shrink-0"
                aria-label={`Remove line ${i + 1}`}
                disabled={lines.length === 1}
                onClick={() => setLines((prev) => prev.filter((l) => l.key !== line.key))}
              >
                <X className="size-4" />
              </Button>
            </div>
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="self-start"
          onClick={() => {
            setLines((prev) => [...prev, { key: nextKey, description: "", amount: "" }]);
            setNextKey((k) => k + 1);
          }}
        >
          <Plus className="size-3.5" /> Add a line
        </Button>
      </Card>

      {canDeposit ? (
        <label className="flex items-start gap-3 rounded-lg border border-border p-3 text-sm">
          <Checkbox
            name="deposit"
            checked={deposit}
            onCheckedChange={(v) => setDeposit(v === true)}
            className="mt-0.5"
          />
          <span>
            <span className="font-medium">This is a deposit</span>
            <span className="block text-xs text-muted-foreground">
              Shown as a deposit invoice, without tax. Once paid, the money becomes this
              client&apos;s credit, which you apply to the invoices for the work. Leave it off for
              a set fee that settles on its own.
            </span>
          </span>
        </label>
      ) : null}

      <div className="grid gap-5 sm:grid-cols-2">
        {projects.length > 0 ? (
          <div className="flex flex-col gap-2 sm:col-span-2">
            <Label htmlFor="custom-project">Project (optional)</Label>
            <Select name="projectId" value={projectId} onValueChange={setProjectId}>
              <SelectTrigger id="custom-project" className="w-full sm:max-w-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>No project</SelectItem>
                {projects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}
        <div className="flex flex-col gap-2">
          <Label htmlFor="custom-issueDate">Issue date</Label>
          <Input
            id="custom-issueDate"
            name="issueDate"
            type="date"
            value={issueDate}
            onChange={(e) => {
              setIssueDate(e.target.value);
              if (paymentTerms !== "CUSTOM") setDueOverride(null);
            }}
            required
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="custom-paymentTerms">Payment terms</Label>
          <Select
            name="paymentTerms"
            value={paymentTerms}
            onValueChange={(value: PaymentTermsValue) => {
              setTermsOverride(value);
              setDueOverride(value === "CUSTOM" ? dueDate : null);
            }}
          >
            <SelectTrigger id="custom-paymentTerms" className="w-full">
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
          {termsOverride === null ? (
            <p className="text-xs text-muted-foreground">
              {project?.paymentTerms
                ? "This project's default"
                : `This client's default (${paymentTermsLabel(clientTerms)})`}
            </p>
          ) : null}
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="custom-dueDate">Due date</Label>
          <Input
            id="custom-dueDate"
            name="dueDate"
            type="date"
            value={dueDate}
            onChange={(e) => setDueOverride(e.target.value)}
            required
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="custom-poNumber">PO number (optional)</Label>
          <Input id="custom-poNumber" name="poNumber" placeholder="e.g. PO-4821" />
        </div>
        {deposit ? null : (
          <div className="flex flex-col gap-2">
            <Label htmlFor="custom-taxRate">Tax rate (%)</Label>
            <Input
              id="custom-taxRate"
              name="taxRate"
              type="number"
              step="0.01"
              min="0"
              max="100"
              value={taxRate}
              onChange={(e) => setTaxRate(e.target.value)}
            />
          </div>
        )}
        <div className="flex flex-col gap-2 sm:col-span-2">
          <Label htmlFor="custom-notes">Notes</Label>
          <Textarea
            id="custom-notes"
            name="notes"
            rows={3}
            maxLength={2000}
            placeholder="Shown on the invoice, e.g. what the deposit covers, or remittance details."
          />
        </div>
      </div>

      <div className="flex flex-col gap-1 self-end text-right">
        <div className="flex justify-between gap-8 text-sm text-muted-foreground">
          <span>Subtotal</span>
          <span className="tabular-figures">{formatCurrency(subtotal, currency)}</span>
        </div>
        {deposit ? null : (
          <div className="flex justify-between gap-8 text-sm text-muted-foreground">
            <span>Tax</span>
            <span className="tabular-figures">{formatCurrency(taxAmount, currency)}</span>
          </div>
        )}
        <div className="flex justify-between gap-8 text-base font-semibold">
          <span>Total</span>
          <span className="tabular-figures">{formatCurrency(total, currency)}</span>
        </div>
      </div>

      <SubmitButton className="self-end" pendingText="Creating..." pending={isPending} disabled={subtotal <= 0}>
        Create draft invoice
      </SubmitButton>
    </form>
  );
}
