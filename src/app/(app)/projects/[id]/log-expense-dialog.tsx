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
import { SubmitButton } from "@/components/forms/submit-button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { logExpenseAction } from "@/actions/expenses";
import { toISODate } from "@/lib/date";
import type { ActionState } from "@/actions/auth";

export function LogExpenseDialog({ projectId }: { projectId: string }) {
  const [open, setOpen] = useState(false);
  const action = logExpenseAction.bind(null, projectId);
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(action, null);
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
          <Plus className="size-3.5" /> Log expense
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Log an expense</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="flex flex-col gap-4">
          {state?.error ? (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          ) : null}
          <div className="flex flex-col gap-2">
            <Label htmlFor="expense-description">Description</Label>
            <Input
              id="expense-description"
              name="description"
              placeholder="e.g. Figma seat for this engagement"
              required
            />
            {state?.fieldErrors?.description ? (
              <p className="text-sm text-destructive">{state.fieldErrors.description[0]}</p>
            ) : null}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="expense-amount">Amount</Label>
              <Input
                id="expense-amount"
                name="amount"
                type="number"
                step="0.01"
                min="0.01"
                required
              />
              {state?.fieldErrors?.amount ? (
                <p className="text-sm text-destructive">{state.fieldErrors.amount[0]}</p>
              ) : null}
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="expense-incurredAt">Date</Label>
              <Input
                id="expense-incurredAt"
                name="incurredAt"
                type="date"
                defaultValue={toISODate(new Date())}
                required
              />
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="expense-category">Category (optional)</Label>
            <Input
              id="expense-category"
              name="category"
              placeholder="e.g. Software, Hardware, Travel"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="expense-receipt">Receipt (optional)</Label>
            <Input
              id="expense-receipt"
              name="receiptFile"
              type="file"
              accept="image/png,image/jpeg,image/webp,application/pdf"
            />
          </div>
          <SubmitButton pendingText="Logging...">Log expense</SubmitButton>
        </form>
      </DialogContent>
    </Dialog>
  );
}
