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
import { Textarea } from "@/components/ui/textarea";
import { SubmitButton } from "@/components/forms/submit-button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { createMilestoneAction } from "@/actions/milestones";
import type { ActionState } from "@/actions/auth";

export function AddMilestoneDialog({ projectId }: { projectId: string }) {
  const [open, setOpen] = useState(false);
  const action = createMilestoneAction.bind(null, projectId);
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
          <Plus className="size-3.5" /> Add milestone
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a milestone</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="flex flex-col gap-4">
          {state?.error ? (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          ) : null}
          <div className="flex flex-col gap-2">
            <Label htmlFor="milestone-name">Name</Label>
            <Input id="milestone-name" name="name" placeholder="e.g. Design approval" required />
            {state?.fieldErrors?.name ? (
              <p className="text-sm text-destructive">{state.fieldErrors.name[0]}</p>
            ) : null}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="milestone-description">Description</Label>
            <Textarea id="milestone-description" name="description" rows={3} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="milestone-amount">Amount</Label>
              <Input
                id="milestone-amount"
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
              <Label htmlFor="milestone-dueDate">Due date (optional)</Label>
              <Input id="milestone-dueDate" name="dueDate" type="date" />
            </div>
          </div>
          <SubmitButton pendingText="Adding...">Add milestone</SubmitButton>
        </form>
      </DialogContent>
    </Dialog>
  );
}
