"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SubmitButton } from "@/components/forms/submit-button";
import {
  savePaymentMethodAction,
  deletePaymentMethodAction,
  movePaymentMethodAction,
} from "@/actions/payment-methods";
import {
  PAYMENT_TYPES,
  displayPaymentMethod,
  paymentTypeDef,
  type PaymentDetails,
  type PaymentMethodType,
} from "@/lib/payment-methods";
import type { ActionState } from "@/actions/auth";

export type EditableMethod = {
  id: string;
  type: PaymentMethodType;
  label: string | null;
  details: PaymentDetails;
  showOnPdf: boolean;
};

// Account identifiers are shown masked in the list; the full value is only
// in the edit form and on the client-facing outputs.
const MASKED = new Set(["accountNumber", "iban", "address"]);
const mask = (v: string) => (v.length > 4 ? `•••• ${v.slice(-4)}` : v);

export function PaymentMethodsEditor({
  clientId,
  methods,
  readOnly,
  emptyText,
}: {
  clientId: string | null;
  methods: EditableMethod[];
  readOnly: boolean;
  emptyText: string;
}) {
  // "new" = adding, an id = editing that method, null = list only.
  const [editing, setEditing] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <div className="flex flex-col gap-3">
      {methods.length === 0 && editing !== "new" ? (
        <p className="text-sm text-muted-foreground">{emptyText}</p>
      ) : null}

      <ul className="flex flex-col gap-2">
        {methods.map((m, i) =>
          editing === m.id ? (
            <li key={m.id}>
              <MethodForm clientId={clientId} method={m} onDone={() => setEditing(null)} />
            </li>
          ) : (
            <li key={m.id} className="rounded-lg border border-border p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{displayPaymentMethod(m).title}</p>
                    {!m.showOnPdf ? (
                      <Badge variant="outline" className="font-normal">
                        Share page only
                      </Badge>
                    ) : null}
                  </div>
                  <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 text-muted-foreground">
                    {paymentTypeDef(m.type)
                      .fields.filter((f) => m.details[f.key])
                      .map((f) => (
                        <div key={f.key} className="contents">
                          {m.type === "OTHER" ? null : <dt>{f.label}</dt>}
                          <dd
                            className={
                              m.type === "OTHER"
                                ? "col-span-2 whitespace-pre-line"
                                : f.multiline
                                  ? "whitespace-pre-line"
                                  : "truncate"
                            }
                          >
                            {MASKED.has(f.key) ? mask(m.details[f.key]) : m.details[f.key]}
                          </dd>
                        </div>
                      ))}
                  </dl>
                </div>
                {readOnly ? null : (
                  <div className="flex shrink-0 items-center">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7"
                      aria-label="Move up"
                      disabled={i === 0 || isPending}
                      onClick={() => startTransition(() => movePaymentMethodAction(m.id, "up"))}
                    >
                      <ArrowUp className="size-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7"
                      aria-label="Move down"
                      disabled={i === methods.length - 1 || isPending}
                      onClick={() => startTransition(() => movePaymentMethodAction(m.id, "down"))}
                    >
                      <ArrowDown className="size-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7"
                      aria-label="Edit"
                      onClick={() => setEditing(m.id)}
                    >
                      <Pencil className="size-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7"
                      aria-label="Remove"
                      disabled={isPending}
                      onClick={() => {
                        if (confirm("Remove this payment method?")) {
                          startTransition(() => deletePaymentMethodAction(m.id));
                        }
                      }}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                )}
              </div>
            </li>
          ),
        )}
      </ul>

      {readOnly ? null : editing === "new" ? (
        <MethodForm clientId={clientId} onDone={() => setEditing(null)} />
      ) : editing === null ? (
        <Button
          variant="outline"
          size="sm"
          className="self-start"
          onClick={() => setEditing("new")}
        >
          <Plus className="size-3.5" /> Add payment method
        </Button>
      ) : null}
    </div>
  );
}

function MethodForm({
  clientId,
  method,
  onDone,
}: {
  clientId: string | null;
  method?: EditableMethod;
  onDone: () => void;
}) {
  const [type, setType] = useState<PaymentMethodType | null>(method?.type ?? null);
  const [state, formAction] = useActionState<ActionState, FormData>(
    savePaymentMethodAction.bind(null, { clientId, methodId: method?.id ?? null }),
    null,
  );

  useEffect(() => {
    if (state?.saved) onDone();
  }, [state, onDone]);

  if (!type) {
    return (
      <div className="flex flex-col gap-3 rounded-lg border border-border p-3">
        <p className="text-sm font-medium">What kind of payment method?</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {PAYMENT_TYPES.map((t) => (
            <Button
              key={t.type}
              type="button"
              variant="outline"
              size="sm"
              className="justify-start"
              onClick={() => setType(t.type)}
            >
              {t.name}
            </Button>
          ))}
        </div>
        <Button type="button" variant="ghost" size="sm" className="self-start" onClick={onDone}>
          Cancel
        </Button>
      </div>
    );
  }

  const def = paymentTypeDef(type);
  const err = (key: string) => state?.fieldErrors?.[key]?.[0];

  return (
    <form
      // Remount when the type changes (defaults follow the type) and after a
      // failed save (so the echoed values refill the reset fields).
      key={`${type}-${state?.values ? JSON.stringify(state.values) : ""}`}
      action={formAction}
      className="flex flex-col gap-3 rounded-lg border border-border p-3"
    >
      <input type="hidden" name="type" value={type} />
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">{def.name}</p>
        {method ? null : (
          <Button type="button" variant="ghost" size="sm" onClick={() => setType(null)}>
            Change type
          </Button>
        )}
      </div>
      {state?.error ? <p className="text-sm text-destructive">{state.error}</p> : null}

      <div className="grid gap-3 sm:grid-cols-2">
        {def.fields.map((f) => {
          const id = `pm-${f.key}`;
          const value = state?.values?.[`d_${f.key}`] ?? method?.details[f.key] ?? "";
          return (
            <div
              key={f.key}
              className={
                f.multiline ? "flex flex-col gap-1.5 sm:col-span-2" : "flex flex-col gap-1.5"
              }
            >
              <Label htmlFor={id}>
                {f.label}
                {f.required ? null : (
                  <span className="font-normal text-muted-foreground"> (optional)</span>
                )}
              </Label>
              {f.options ? (
                <Select name={`d_${f.key}`} defaultValue={value || f.options[0]}>
                  <SelectTrigger id={id} className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {f.options.map((o) => (
                      <SelectItem key={o} value={o}>
                        {o}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : f.multiline ? (
                <Textarea
                  id={id}
                  name={`d_${f.key}`}
                  rows={3}
                  defaultValue={value}
                  placeholder={f.placeholder}
                />
              ) : (
                <Input
                  id={id}
                  name={`d_${f.key}`}
                  defaultValue={value}
                  placeholder={f.placeholder}
                  autoComplete="off"
                  inputMode={f.key.endsWith("Number") ? "numeric" : undefined}
                />
              )}
              {err(f.key) ? <p className="text-sm text-destructive">{err(f.key)}</p> : null}
            </div>
          );
        })}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="pm-label">
            Nickname <span className="font-normal text-muted-foreground">(optional)</span>
          </Label>
          <Input
            id="pm-label"
            name="label"
            defaultValue={state?.values?.label ?? method?.label ?? ""}
            placeholder="Operating account"
          />
        </div>
      </div>

      <div className="flex items-start gap-2">
        <Checkbox
          id="pm-showOnPdf"
          name="showOnPdf"
          defaultChecked={
            state?.values
              ? state.values.showOnPdf === "on"
              : (method?.showOnPdf ?? def.showOnPdfByDefault)
          }
          className="mt-0.5"
        />
        <Label htmlFor="pm-showOnPdf" className="flex-col items-start gap-0.5 font-normal">
          Show on invoice PDFs
          <span className="text-xs text-muted-foreground">
            Off keeps it to the client&apos;s secure share page — safer for bank details, since a
            PDF can be forwarded anywhere.
          </span>
        </Label>
      </div>

      {clientId && !method ? (
        <div className="flex items-start gap-2">
          <Checkbox id="pm-orgWide" name="orgWide" className="mt-0.5" />
          <Label htmlFor="pm-orgWide" className="flex-col items-start gap-0.5 font-normal">
            Add for the whole organization
            <span className="text-xs text-muted-foreground">
              Saves it under Settings → Payments, offered to every client that uses the
              organization&apos;s methods — this one included.
            </span>
          </Label>
        </div>
      ) : null}

      <div className="flex gap-2">
        <SubmitButton size="sm" pendingText="Saving...">
          {method ? "Save" : "Add"}
        </SubmitButton>
        <Button type="button" variant="ghost" size="sm" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
