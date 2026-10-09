"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { CalendarClock, Pause, Play, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { EmptyState } from "@/components/empty-state";
import { SubmitButton } from "@/components/forms/submit-button";
import { ConfirmSubmitButton } from "@/components/forms/confirm-submit-button";
import {
  saveBillingCycleAction,
  setBillingCycleActiveAction,
  deleteBillingCycleAction,
} from "@/actions/recurring-invoices";
import {
  BILLING_INTERVALS,
  billingIntervalLabel,
  type BillingInterval,
} from "@/lib/billing-interval";
import { formatDate } from "@/lib/format";
import { toISODate } from "@/lib/date";
import type { ActionState } from "@/actions/auth";

const PAYMENT_TERMS = [
  { value: "DUE_ON_RECEIPT", label: "Due on receipt" },
  { value: "NET15", label: "Net 15" },
  { value: "NET30", label: "Net 30" },
  { value: "NET45", label: "Net 45" },
  { value: "NET60", label: "Net 60" },
  { value: "NET90", label: "Net 90" },
] as const;

export type BillingCycleItem = {
  interval: BillingInterval;
  paymentTerms: string;
  autoSend: boolean;
  active: boolean;
  nextRunAt: string;
  lastRunAt: string | null;
  lastInvoice: { id: string; number: string } | null;
  lastRunNote: string | null;
};

export function BillingCycleCard({
  clientId,
  cycle,
  defaultTerms,
}: {
  clientId: string;
  cycle: BillingCycleItem | null;
  /** The client's (or org's) default terms, for a new cycle. */
  defaultTerms: string;
}) {
  const [editing, setEditing] = useState(false);
  const [isPending, startTransition] = useTransition();

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Billing cycle</CardTitle>
        {cycle && !editing ? (
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
              Edit
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              disabled={isPending}
              aria-label={cycle.active ? "Pause" : "Resume"}
              onClick={() =>
                startTransition(() => setBillingCycleActiveAction(clientId, !cycle.active))
              }
            >
              {cycle.active ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
            </Button>
            <form action={deleteBillingCycleAction.bind(null, clientId)}>
              <ConfirmSubmitButton
                variant="ghost"
                size="icon"
                className="size-7"
                aria-label="Remove"
                confirmMessage="Stop invoicing this client automatically? Invoices already generated aren't affected."
              >
                <Trash2 className="size-3.5" />
              </ConfirmSubmitButton>
            </form>
          </div>
        ) : null}
      </CardHeader>
      <CardContent>
        {editing ? (
          <BillingCycleForm
            clientId={clientId}
            cycle={cycle}
            defaultTerms={defaultTerms}
            onDone={() => setEditing(false)}
          />
        ) : cycle ? (
          <CycleSummary cycle={cycle} />
        ) : (
          <div className="flex flex-col items-center gap-3">
            <EmptyState
              icon={CalendarClock}
              title="Invoiced by hand"
              description="Optionally generate an invoice on a schedule — weekly, every two weeks, monthly — from this client's unbilled time, milestones, and expenses."
            />
            <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
              Set up billing cycle
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function CycleSummary({ cycle }: { cycle: BillingCycleItem }) {
  const terms =
    PAYMENT_TERMS.find((t) => t.value === cycle.paymentTerms)?.label ?? cycle.paymentTerms;
  return (
    <div className="flex flex-col gap-3 text-sm">
      <div className="flex items-center gap-2">
        <p className="font-medium">{billingIntervalLabel(cycle.interval)}</p>
        {!cycle.active ? (
          <Badge variant="outline" className="font-normal">
            Paused
          </Badge>
        ) : null}
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
        <dt className="text-muted-foreground">Next invoice</dt>
        <dd>{cycle.active ? formatDate(cycle.nextRunAt) : "—"}</dd>
        <dt className="text-muted-foreground">Terms</dt>
        <dd>{terms}</dd>
        <dt className="text-muted-foreground">On generate</dt>
        <dd>{cycle.autoSend ? "Mark as sent" : "Leave as draft to review"}</dd>
        {cycle.lastRunAt ? (
          <>
            <dt className="text-muted-foreground">Last run</dt>
            <dd>
              {formatDate(cycle.lastRunAt)}
              {cycle.lastInvoice ? (
                <>
                  {" · "}
                  <Link
                    href={`/invoices/${cycle.lastInvoice.id}`}
                    className="text-brand hover:underline"
                  >
                    {cycle.lastInvoice.number}
                  </Link>
                </>
              ) : cycle.lastRunNote ? (
                <span className="text-muted-foreground"> · {cycle.lastRunNote}</span>
              ) : null}
            </dd>
          </>
        ) : null}
      </dl>
    </div>
  );
}

function BillingCycleForm({
  clientId,
  cycle,
  defaultTerms,
  onDone,
}: {
  clientId: string;
  cycle: BillingCycleItem | null;
  defaultTerms: string;
  onDone: () => void;
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(saveBillingCycleAction, null);

  useEffect(() => {
    if (state?.saved) onDone();
  }, [state, onDone]);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="clientId" value={clientId} />
      {state?.error ? (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}
      <p className="text-xs text-muted-foreground">
        Each run invoices everything unbilled — billable time, completed milestones, and approved
        expenses — dated before the run date. Nothing to bill means no invoice.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="bc-interval">Frequency</Label>
          <Select name="interval" defaultValue={cycle?.interval ?? "MONTHLY"}>
            <SelectTrigger id="bc-interval" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {BILLING_INTERVALS.map((i) => (
                <SelectItem key={i.value} value={i.value}>
                  {i.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="bc-startDate">{cycle ? "Next invoice date" : "First invoice date"}</Label>
          <Input
            id="bc-startDate"
            name="startDate"
            type="date"
            defaultValue={cycle ? cycle.nextRunAt.slice(0, 10) : toISODate(new Date())}
            required
          />
          {state?.fieldErrors?.startDate ? (
            <p className="text-sm text-destructive">{state.fieldErrors.startDate[0]}</p>
          ) : null}
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="bc-paymentTerms">Payment terms</Label>
          <Select name="paymentTerms" defaultValue={cycle?.paymentTerms ?? defaultTerms}>
            <SelectTrigger id="bc-paymentTerms" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAYMENT_TERMS.map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="flex items-start gap-2">
        <Checkbox
          id="bc-autoSend"
          name="autoSend"
          defaultChecked={cycle?.autoSend ?? false}
          className="mt-0.5"
        />
        <Label htmlFor="bc-autoSend" className="text-sm font-normal">
          Mark as sent automatically instead of leaving a draft to review
        </Label>
      </div>
      <div className="flex gap-2">
        <SubmitButton pendingText="Saving...">
          {cycle ? "Save" : "Start billing cycle"}
        </SubmitButton>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
