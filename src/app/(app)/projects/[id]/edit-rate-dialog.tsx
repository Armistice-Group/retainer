"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Pencil } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/forms/submit-button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { addProjectMemberAction } from "@/actions/projects";
import type { ActionState } from "@/actions/auth";

export function EditRateDialog({
  projectId,
  userId,
  name,
  billRate,
  currency,
}: {
  projectId: string;
  userId: string;
  name: string;
  billRate: number;
  currency: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(
    addProjectMemberAction,
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
      <Button variant="ghost" size="icon" className="size-7" onClick={() => setOpen(true)}>
        <Pencil className="size-3.5" />
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit rate — {name}</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="flex flex-col gap-4">
          <input type="hidden" name="projectId" value={projectId} />
          <input type="hidden" name="userId" value={userId} />
          {state?.error ? (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          ) : null}
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor={`rate-${userId}`}>Hourly rate</Label>
              <Input
                id={`rate-${userId}`}
                name="billRate"
                type="number"
                step="0.01"
                min="0"
                defaultValue={billRate}
                required
              />
              {state?.fieldErrors?.billRate ? (
                <p className="text-sm text-destructive">{state.fieldErrors.billRate[0]}</p>
              ) : null}
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor={`currency-${userId}`}>Currency</Label>
              <Input
                id={`currency-${userId}`}
                name="currency"
                defaultValue={currency}
                required
              />
            </div>
          </div>
          <SubmitButton pendingText="Saving...">Save rate</SubmitButton>
        </form>
      </DialogContent>
    </Dialog>
  );
}
