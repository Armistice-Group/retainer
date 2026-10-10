"use client";

import { useActionState, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SubmitButton } from "@/components/forms/submit-button";
import { saveEstimateAction } from "@/actions/estimates";
import type { ActionState } from "@/actions/auth";

export type EstimateFormLine = {
  description: string;
  quantity: string;
  rate: string;
  isMilestone: boolean;
  dueMode: "none" | "date" | "days";
  milestoneDueDate: string;
  milestoneDueDays: string;
};

export type EstimateFormValues = {
  clientId: string;
  projectId: string;
  title: string;
  intro: string;
  issueDate: string;
  expiresAt: string;
  taxRate: string;
  proposedBillingType: "" | "HOURLY" | "FLAT_FEE" | "MILESTONE";
  proposedRate: string;
  proposedBudget: string;
  lineItems: EstimateFormLine[];
};

export const emptyLine: EstimateFormLine = {
  description: "",
  quantity: "1",
  rate: "0",
  isMilestone: false,
  dueMode: "none",
  milestoneDueDate: "",
  milestoneDueDays: "",
};

const NONE = "__none";

function money(n: number, currency: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(n);
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

export function EstimateForm({
  estimateId,
  initial,
  clients,
  projects,
  currency,
}: {
  estimateId: string | null;
  initial: EstimateFormValues;
  clients: { id: string; name: string }[];
  projects: { id: string; name: string; clientId: string }[];
  currency: string;
}) {
  const [values, setValues] = useState<EstimateFormValues>(initial);
  const [state, formAction] = useActionState<ActionState, FormData>(
    saveEstimateAction.bind(null, estimateId),
    null
  );

  const set = <K extends keyof EstimateFormValues>(key: K, value: EstimateFormValues[K]) =>
    setValues((v) => ({ ...v, [key]: value }));
  const setLine = (index: number, patch: Partial<EstimateFormLine>) =>
    setValues((v) => ({
      ...v,
      lineItems: v.lineItems.map((l, i) => (i === index ? { ...l, ...patch } : l)),
    }));

  const clientProjects = projects.filter((p) => p.clientId === values.clientId);
  const amounts = values.lineItems.map((l) => round2((Number(l.quantity) || 0) * (Number(l.rate) || 0)));
  const subtotal = round2(amounts.reduce((s, a) => s + a, 0));
  const tax = round2((subtotal * (Number(values.taxRate) || 0)) / 100);
  const hasMilestones = values.lineItems.some((l) => l.isMilestone);
  const effectiveType = values.proposedBillingType || (hasMilestones ? "MILESTONE" : "FLAT_FEE");

  const payload = useMemo(
    () =>
      JSON.stringify({
        clientId: values.clientId,
        projectId: values.projectId || null,
        title: values.title,
        intro: values.intro,
        issueDate: values.issueDate || undefined,
        expiresAt: values.expiresAt || null,
        taxRate: values.taxRate || 0,
        proposedBillingType: values.proposedBillingType || null,
        proposedRate: values.proposedRate ? values.proposedRate : null,
        proposedBudget: values.proposedBudget ? values.proposedBudget : null,
        lineItems: values.lineItems.map((l) => ({
          description: l.description,
          quantity: l.quantity || 0,
          rate: l.rate || 0,
          isMilestone: l.isMilestone,
          milestoneDueDate: l.isMilestone && l.dueMode === "date" ? l.milestoneDueDate || null : null,
          milestoneDueDays:
            l.isMilestone && l.dueMode === "days" && l.milestoneDueDays !== ""
              ? Number(l.milestoneDueDays)
              : null,
        })),
      }),
    [values]
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="payload" value={payload} />
      {state?.error ? (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Estimate</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="clientId">Client</Label>
            <Select
              value={values.clientId || undefined}
              onValueChange={(v) => setValues((cur) => ({ ...cur, clientId: v, projectId: "" }))}
            >
              <SelectTrigger id="clientId" className="w-full">
                <SelectValue placeholder="Select a client" />
              </SelectTrigger>
              <SelectContent>
                {clients.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="projectId">Existing project (optional)</Label>
            <Select
              value={values.projectId || NONE}
              onValueChange={(v) => set("projectId", v === NONE ? "" : v)}
              disabled={!values.clientId}
            >
              <SelectTrigger id="projectId" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>None: a new project once accepted</SelectItem>
                {clientProjects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2 sm:col-span-2">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              value={values.title}
              onChange={(e) => set("title", e.target.value)}
              placeholder="e.g. Website redesign, phase 1"
              maxLength={200}
              required
            />
          </div>
          <div className="flex flex-col gap-2 sm:col-span-2">
            <Label htmlFor="intro">Scope (optional)</Label>
            <Textarea
              id="intro"
              rows={8}
              value={values.intro}
              onChange={(e) => set("intro", e.target.value)}
              placeholder={"What's included, what isn't, and how you'll work.\n\n## Deliverables\n- Discovery workshop\n- Designs for 5 pages"}
            />
            <p className="text-xs text-muted-foreground">
              Plain text, or simple markdown: <code># Heading</code>, <code>- list</code>,{" "}
              <code>**bold**</code>, <code>[link](https://…)</code>.
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="issueDate">Date</Label>
            <Input
              id="issueDate"
              type="date"
              value={values.issueDate}
              onChange={(e) => set("issueDate", e.target.value)}
              required
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="expiresAt">Valid until (optional)</Label>
            <Input
              id="expiresAt"
              type="date"
              value={values.expiresAt}
              onChange={(e) => set("expiresAt", e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              The client can accept through this day. Leave empty for no expiry.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Line items</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {values.lineItems.map((line, i) => (
            <div key={i} className="flex flex-col gap-2 border-b border-border pb-3 last:border-0">
              <div className="flex items-end gap-2">
                <div className="flex-1">
                  {i === 0 ? <Label className="mb-1.5 text-xs text-muted-foreground">Description</Label> : null}
                  <Input
                    value={line.description}
                    onChange={(e) => setLine(i, { description: e.target.value })}
                    placeholder="e.g. Discovery and research"
                    aria-label={`Line ${i + 1} description`}
                    maxLength={500}
                  />
                </div>
                <div className="w-20">
                  {i === 0 ? <Label className="mb-1.5 text-xs text-muted-foreground">Qty</Label> : null}
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={line.quantity}
                    onChange={(e) => setLine(i, { quantity: e.target.value })}
                    aria-label={`Line ${i + 1} quantity`}
                    className="tabular-figures"
                  />
                </div>
                <div className="w-28">
                  {i === 0 ? <Label className="mb-1.5 text-xs text-muted-foreground">Unit price</Label> : null}
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={line.rate}
                    onChange={(e) => setLine(i, { rate: e.target.value })}
                    aria-label={`Line ${i + 1} unit price`}
                    className="tabular-figures"
                  />
                </div>
                <div className="tabular-figures w-24 shrink-0 pb-2 text-right text-sm">
                  {money(amounts[i] ?? 0, currency)}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-8 shrink-0"
                  aria-label={`Remove line ${i + 1}`}
                  disabled={values.lineItems.length === 1}
                  onClick={() =>
                    setValues((v) => ({ ...v, lineItems: v.lineItems.filter((_, j) => j !== i) }))
                  }
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <label className="flex items-center gap-2">
                  <Checkbox
                    checked={line.isMilestone}
                    onCheckedChange={(c) => setLine(i, { isMilestone: c === true })}
                  />
                  Becomes a milestone
                </label>
                {line.isMilestone ? (
                  <>
                    <Select
                      value={line.dueMode}
                      onValueChange={(v) => setLine(i, { dueMode: v as EstimateFormLine["dueMode"] })}
                    >
                      <SelectTrigger className="h-8 w-48" aria-label={`Line ${i + 1} milestone due`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No due date</SelectItem>
                        <SelectItem value="date">Due on a date</SelectItem>
                        <SelectItem value="days">Due days after acceptance</SelectItem>
                      </SelectContent>
                    </Select>
                    {line.dueMode === "date" ? (
                      <Input
                        type="date"
                        className="h-8 w-40"
                        value={line.milestoneDueDate}
                        onChange={(e) => setLine(i, { milestoneDueDate: e.target.value })}
                        aria-label={`Line ${i + 1} milestone due date`}
                      />
                    ) : null}
                    {line.dueMode === "days" ? (
                      <span className="flex items-center gap-2">
                        <Input
                          type="number"
                          min="0"
                          step="1"
                          className="h-8 w-20"
                          value={line.milestoneDueDays}
                          onChange={(e) => setLine(i, { milestoneDueDays: e.target.value })}
                          aria-label={`Line ${i + 1} days after acceptance`}
                        />
                        <span className="text-muted-foreground">days after acceptance</span>
                      </span>
                    ) : null}
                  </>
                ) : null}
              </div>
            </div>
          ))}
          <div className="flex items-center justify-between gap-4 pt-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setValues((v) => ({ ...v, lineItems: [...v.lineItems, { ...emptyLine }] }))}
            >
              <Plus className="size-3.5" /> Add line
            </Button>
            <div className="flex flex-col items-end gap-1 text-sm">
              <div className="flex items-center gap-2">
                <Label htmlFor="taxRate" className="text-muted-foreground">
                  Tax (%)
                </Label>
                <Input
                  id="taxRate"
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  className="h-8 w-20"
                  value={values.taxRate}
                  onChange={(e) => set("taxRate", e.target.value)}
                />
              </div>
              <span className="tabular-figures text-muted-foreground">
                Subtotal {money(subtotal, currency)}
                {tax ? ` · Tax ${money(tax, currency)}` : ""}
              </span>
              <span className="tabular-figures text-base font-semibold">
                Total {money(round2(subtotal + tax), currency)}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Project once accepted (optional)</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <div className="flex flex-col gap-2">
            <Label htmlFor="proposedBillingType">Billing type</Label>
            <Select
              value={values.proposedBillingType || NONE}
              onValueChange={(v) =>
                set("proposedBillingType", v === NONE ? "" : (v as EstimateFormValues["proposedBillingType"]))
              }
            >
              <SelectTrigger id="proposedBillingType" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Automatic</SelectItem>
                <SelectItem value="HOURLY">Hourly</SelectItem>
                <SelectItem value="FLAT_FEE">Flat fee</SelectItem>
                <SelectItem value="MILESTONE">Milestone-based</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="proposedRate">Hourly rate</Label>
            <Input
              id="proposedRate"
              type="number"
              step="0.01"
              min="0"
              value={values.proposedRate}
              onChange={(e) => set("proposedRate", e.target.value)}
              placeholder="For hourly projects"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="proposedBudget">Budget</Label>
            <Input
              id="proposedBudget"
              type="number"
              step="0.01"
              min="0"
              value={values.proposedBudget}
              onChange={(e) => set("proposedBudget", e.target.value)}
              placeholder={`Subtotal (${money(subtotal, currency)})`}
            />
          </div>
          <p className="text-xs text-muted-foreground sm:col-span-3">
            {values.projectId
              ? "This estimate is for an existing project, so no project is created when it's accepted."
              : effectiveType === "MILESTONE"
                ? "Creates a milestone-based project with a milestone for each line marked as one."
                : effectiveType === "HOURLY"
                  ? "Creates an hourly project; its budget hours are the budget divided by the hourly rate."
                  : "Creates a flat-fee project with the budget as its fee."}
            {hasMilestones && effectiveType !== "MILESTONE" && !values.projectId
              ? " Lines marked as milestones only become milestones on a milestone-based project."
              : ""}
          </p>
        </CardContent>
      </Card>

      <div>
        <SubmitButton pendingText="Saving...">{estimateId ? "Save estimate" : "Create estimate"}</SubmitButton>
      </div>
    </form>
  );
}
