"use client";

import { useActionState, useState } from "react";
import { toast } from "sonner";
import { Plus } from "lucide-react";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SubmitButton } from "@/components/forms/submit-button";
import { PaymentTermsSelect } from "@/components/forms/payment-terms-select";
import { createDepositInvoiceAction, issueCreditNoteAction } from "@/actions/payments";
import type { ActionState } from "@/actions/auth";

const NONE = "none";
const today = () => new Date().toISOString().slice(0, 10);
const money = (amount: number, currency: string) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount);

/** A draft deposit (advance) invoice: a fixed amount, or a percentage of a
 * flat-fee project. Paid deposits become client credit. */
export function DepositInvoiceDialog({
  clientId,
  projects,
  currency,
}: {
  clientId: string;
  projects: { id: string; name: string; flatFeeAmount: number | null }[];
  currency: string;
}) {
  const [open, setOpen] = useState(false);
  const [projectId, setProjectId] = useState(NONE);
  const [by, setBy] = useState<"amount" | "percent">("amount");
  const [percent, setPercent] = useState("50");
  const project = projects.find((p) => p.id === projectId) ?? null;
  const [state, formAction] = useActionState<ActionState, FormData>(
    (prev, formData) => createDepositInvoiceAction(clientId, prev, formData),
    null
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Plus className="size-3.5" /> Deposit
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New deposit invoice</DialogTitle>
          <DialogDescription>
            Bill an amount up front, e.g. 50% before work starts. It&apos;s created as a draft for
            you to send. Once paid, the money becomes this client&apos;s credit, which you apply to
            the invoices for the work.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="flex flex-col gap-4">
          {state?.error ? (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          ) : null}
          <div className="flex flex-col gap-2">
            <Label htmlFor="deposit-project">Project (optional)</Label>
            <Select name="projectId" value={projectId} onValueChange={setProjectId}>
              <SelectTrigger id="deposit-project" className="w-full">
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
          <input type="hidden" name="by" value={by} />
          {project?.flatFeeAmount ? (
            <div className="flex gap-4 text-sm">
              <label className="flex items-center gap-2">
                <input type="radio" checked={by === "amount"} onChange={() => setBy("amount")} />
                Fixed amount
              </label>
              <label className="flex items-center gap-2">
                <input type="radio" checked={by === "percent"} onChange={() => setBy("percent")} />
                Percent of the {money(project.flatFeeAmount, currency)} flat fee
              </label>
            </div>
          ) : null}
          {by === "percent" && project?.flatFeeAmount ? (
            <div className="flex flex-col gap-2">
              <Label htmlFor="deposit-percent">Percent</Label>
              <Input
                id="deposit-percent"
                name="percent"
                type="number"
                min="1"
                max="100"
                step="0.01"
                value={percent}
                onChange={(e) => setPercent(e.target.value)}
                required
              />
              <p className="text-xs text-muted-foreground">
                = {money((project.flatFeeAmount * Number(percent || 0)) / 100, currency)}
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <Label htmlFor="deposit-amount">Amount ({currency})</Label>
              <Input id="deposit-amount" name="amount" type="number" min="0.01" step="0.01" required />
            </div>
          )}
          <div className="flex flex-col gap-2">
            <Label htmlFor="deposit-description">Line description (optional)</Label>
            <Input
              id="deposit-description"
              name="description"
              placeholder={project ? `${project.name} — Deposit` : "Deposit"}
              maxLength={500}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="deposit-issue">Issue date</Label>
              <Input id="deposit-issue" name="issueDate" type="date" defaultValue={today()} required />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="deposit-terms">Payment terms</Label>
              <PaymentTermsSelect
                id="deposit-terms"
                defaultValue={null}
                inheritLabel="Project, client or org default"
              />
            </div>
          </div>
          <SubmitButton pendingText="Creating...">Create draft deposit</SubmitButton>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Issue a credit note (CN-0001, …), optionally against one of the client's
 * invoices and applied to it straight away. */
export function IssueCreditNoteDialog({
  clientId,
  currency,
  invoices,
}: {
  clientId: string;
  currency: string;
  invoices: { id: string; number: string; status: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [invoiceId, setInvoiceId] = useState(NONE);
  const selected = invoices.find((i) => i.id === invoiceId) ?? null;
  const [state, formAction] = useActionState<ActionState, FormData>(async (prev, formData) => {
    if (formData.get("invoiceId") === NONE) formData.delete("invoiceId");
    const result = await issueCreditNoteAction(clientId, prev, formData);
    if (result?.saved) {
      setOpen(false);
      toast.success("Credit note issued.");
    }
    return result;
  }, null);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Plus className="size-3.5" /> Credit note
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Issue credit note</DialogTitle>
          <DialogDescription>
            Gives this client credit, with its own number and PDF. Use it to write off part of an
            invoice, or for a refund you&apos;re settling as credit. It isn&apos;t a refund by
            itself.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="flex flex-col gap-4">
          {state?.error ? (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          ) : null}
          <div className="flex flex-col gap-2">
            <Label htmlFor="cn-invoice">Against invoice (optional)</Label>
            <Select name="invoiceId" value={invoiceId} onValueChange={setInvoiceId}>
              <SelectTrigger id="cn-invoice" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>None</SelectItem>
                {invoices.map((i) => (
                  <SelectItem key={i.id} value={i.id}>
                    {i.number}
                    {i.status === "PAID" ? " (paid)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              The credit note is in that invoice&apos;s currency, else {currency}.
            </p>
          </div>
          {selected?.status === "SENT" ? (
            <label className="flex items-center gap-2 text-sm">
              <Checkbox name="applyToInvoice" defaultChecked />
              Apply it to {selected.number} now (up to what&apos;s due)
            </label>
          ) : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="cn-amount">Amount</Label>
              <Input id="cn-amount" name="amount" type="number" min="0.01" step="0.01" required />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="cn-date">Issue date</Label>
              <Input id="cn-date" name="issueDate" type="date" defaultValue={today()} required />
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="cn-reason">Reason</Label>
            <Textarea
              id="cn-reason"
              name="reason"
              rows={3}
              maxLength={2000}
              placeholder="e.g. Discount agreed for the delayed launch"
              required
            />
          </div>
          <SubmitButton pendingText="Issuing...">Issue credit note</SubmitButton>
        </form>
      </DialogContent>
    </Dialog>
  );
}
