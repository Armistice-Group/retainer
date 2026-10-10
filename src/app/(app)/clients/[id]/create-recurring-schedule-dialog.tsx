"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
import { SubmitButton } from "@/components/forms/submit-button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { createRecurringScheduleAction } from "@/actions/recurring-invoices";
import { toISODate } from "@/lib/date";
import { BILLING_INTERVALS } from "@/lib/billing-interval";
import type { ActionState } from "@/actions/auth";

export function CreateRecurringScheduleDialog({ clientId }: { clientId: string }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(
    createRecurringScheduleAction,
    null
  );
  const wasPending = useRef(false);

  useEffect(() => {
    if (wasPending.current && !isPending && !state?.error && !state?.fieldErrors) {
      setOpen(false);
    }
    wasPending.current = isPending;
  }, [isPending, state]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Plus className="size-3.5" /> New retainer
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New retainer</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="flex flex-col gap-4">
          <input type="hidden" name="clientId" value={clientId} />
          {state?.error ? (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          ) : null}
          <div className="flex flex-col gap-2">
            <Label htmlFor="rs-description">Description</Label>
            <Input
              id="rs-description"
              name="description"
              placeholder="e.g. Monthly retainer"
              required
            />
            {state?.fieldErrors?.description ? (
              <p className="text-sm text-destructive">{state.fieldErrors.description[0]}</p>
            ) : null}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="rs-amount">Amount</Label>
              <Input id="rs-amount" name="amount" type="number" step="0.01" min="0.01" required />
              {state?.fieldErrors?.amount ? (
                <p className="text-sm text-destructive">{state.fieldErrors.amount[0]}</p>
              ) : null}
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="rs-interval">Frequency</Label>
              <Select name="interval" defaultValue="MONTHLY">
                <SelectTrigger id="rs-interval" className="w-full">
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
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="rs-retainerHours">Retainer hours (optional)</Label>
            <Input
              id="rs-retainerHours"
              name="retainerHours"
              type="number"
              step="0.25"
              min="0"
              placeholder="e.g. 40"
            />
            <p className="text-xs text-muted-foreground">
              If this amount covers a block of hours, enter it here to track billed-vs-logged
              balance on the client page. Leave blank for a flat retainer with no hours dimension.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="rs-startDate">First invoice date</Label>
              <Input
                id="rs-startDate"
                name="startDate"
                type="date"
                defaultValue={toISODate(new Date())}
                required
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="rs-dueInDays">Due (days after issue)</Label>
              <Input id="rs-dueInDays" name="dueInDays" type="number" min="0" defaultValue={30} />
            </div>
          </div>
          <div className="flex items-start gap-2">
            <Checkbox id="rs-autoSend" name="autoSend" className="mt-0.5" />
            <Label htmlFor="rs-autoSend" className="text-sm font-normal">
              Send automatically (emails the invoice to the client) instead of leaving a
              draft to review
            </Label>
          </div>
          <SubmitButton pendingText="Creating...">Create schedule</SubmitButton>
        </form>
      </DialogContent>
    </Dialog>
  );
}
