"use client";

import { useActionState, useMemo, useState } from "react";
import { Clock, Plus, Trash2, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { SubmitButton } from "@/components/forms/submit-button";
import { useActionFeedback } from "@/components/forms/use-action-feedback";
import { saveInvoiceLinesAction } from "@/actions/invoices";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ActionState } from "@/actions/auth";

export type EditableLine = {
  id: string;
  description: string;
  quantity: string;
  rate: string;
  /** Made from logged time (quantity is hours). */
  fromTime: boolean;
};

type Row = EditableLine & { key: string; isNew?: boolean };

const amountOf = (row: { quantity: string; rate: string }) => {
  const q = Number(row.quantity);
  const r = Number(row.rate);
  return Number.isFinite(q) && Number.isFinite(r) ? Math.round(q * r * 100) / 100 : 0;
};

/**
 * A draft's lines as one table with one Save: edits, new lines and removals
 * all go together, so nothing typed in one row is lost by saving another.
 */
export function InvoiceLinesEditor({
  invoiceId,
  currency,
  lines,
}: {
  invoiceId: string;
  currency: string;
  lines: EditableLine[];
}) {
  // Compared by content: a re-render for some other change (saving the
  // details) mustn't throw away lines still being edited.
  const linesKey = JSON.stringify(lines);
  const initial = useMemo(() => (JSON.parse(linesKey) as EditableLine[]).map((l) => ({ ...l, key: l.id })), [linesKey]);
  const [rows, setRows] = useState<Row[]>(initial);
  const [removed, setRemoved] = useState<Row[]>([]);
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(
    saveInvoiceLinesAction.bind(null, invoiceId),
    null
  );
  useActionFeedback(state, isPending, "Lines saved");

  // After a save the server's lines are the new baseline.
  const [baseline, setBaseline] = useState(initial);
  if (baseline !== initial) {
    setBaseline(initial);
    setRows(initial);
    setRemoved([]);
  }

  const original = new Map(initial.map((l) => [l.id, l]));
  const changed = (row: Row) => {
    if (row.isNew) return true;
    const before = original.get(row.id);
    return (
      !before ||
      before.description !== row.description ||
      Number(before.quantity) !== Number(row.quantity) ||
      Number(before.rate) !== Number(row.rate)
    );
  };
  const dirty = removed.length > 0 || rows.some(changed) || rows.length !== initial.length;
  const subtotal = rows.reduce((sum, r) => sum + amountOf(r), 0);

  const update = (key: string, patch: Partial<Row>) =>
    setRows((current) => current.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  return (
    <form
      action={(data) => {
        data.set(
          "lines",
          JSON.stringify(
            rows.map((r) => ({
              id: r.isNew ? undefined : r.id,
              description: r.description,
              quantity: Number(r.quantity),
              rate: Number(r.rate),
            }))
          )
        );
        data.set("removed", JSON.stringify(removed.filter((r) => !r.isNew).map((r) => r.id)));
        formAction(data);
      }}
      className="flex flex-col gap-3"
    >
      {state?.error ? (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="hidden grid-cols-[1fr_5rem_7rem_6rem_2rem] gap-2 text-xs text-muted-foreground sm:grid">
        <span>Description</span>
        <span>Qty</span>
        <span>Rate</span>
        <span className="text-right">Amount</span>
        <span />
      </div>
      {rows.map((row, i) => (
        <div
          key={row.key}
          className={cn(
            "grid grid-cols-[1fr_1fr_2rem] gap-2 border-b border-border pb-3 sm:grid-cols-[1fr_5rem_7rem_6rem_2rem] sm:items-start",
            changed(row) && "border-l-2 border-l-brand pl-2"
          )}
        >
          <div className="col-span-3 sm:col-span-1">
            <Textarea
              aria-label={`Line ${i + 1} description`}
              rows={1}
              value={row.description}
              onChange={(e) => update(row.key, { description: e.target.value })}
              className="min-h-9 resize-y py-1.5"
              required
            />
            {row.fromTime ? (
              <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                <Clock className="size-3" /> From logged time
                {original.get(row.id) && Number(original.get(row.id)!.quantity) !== Number(row.quantity)
                  ? ". Changing the hours here doesn't change the time entries."
                  : ""}
              </p>
            ) : null}
          </div>
          <Input
            aria-label={`Line ${i + 1} quantity`}
            type="number"
            step="0.01"
            value={row.quantity}
            onChange={(e) => update(row.key, { quantity: e.target.value })}
            className="tabular-figures"
            required
          />
          <Input
            aria-label={`Line ${i + 1} rate`}
            type="number"
            step="0.01"
            value={row.rate}
            onChange={(e) => update(row.key, { rate: e.target.value })}
            className="tabular-figures"
            required
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-9 sm:order-last"
            aria-label={`Remove line ${i + 1}`}
            title="Remove line"
            onClick={() => {
              setRows((current) => current.filter((r) => r.key !== row.key));
              setRemoved((current) => [...current, row]);
            }}
          >
            <Trash2 className="size-3.5" />
          </Button>
          <div className="tabular-figures col-span-3 self-center text-right text-sm sm:col-span-1">
            {formatCurrency(amountOf(row), currency)}
          </div>
        </div>
      ))}

      {removed.length ? (
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          {removed.length} line{removed.length === 1 ? "" : "s"} removed when you save
          {removed.some((r) => r.fromTime) ? " (their time becomes unbilled again)" : ""}.
          <Button
            type="button"
            variant="link"
            size="sm"
            className="h-auto p-0"
            onClick={() => {
              setRows((current) => [...current, ...removed]);
              setRemoved([]);
            }}
          >
            <Undo2 className="size-3.5" /> Undo
          </Button>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() =>
            setRows((current) => [
              ...current,
              {
                id: "",
                key: `new-${Date.now()}`,
                description: "",
                quantity: "1",
                rate: "0",
                fromTime: false,
                isNew: true,
              },
            ])
          }
        >
          <Plus className="size-3.5" /> Add line
        </Button>
        <div className="flex items-center gap-3">
          <span className="tabular-figures text-sm text-muted-foreground">
            Subtotal {formatCurrency(subtotal, currency)}
          </span>
          {dirty ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setRows(initial);
                setRemoved([]);
              }}
            >
              Discard changes
            </Button>
          ) : null}
          <SubmitButton size="sm" pendingText="Saving..." disabled={!dirty}>
            {dirty ? "Save lines" : "Saved"}
          </SubmitButton>
        </div>
      </div>
    </form>
  );
}
