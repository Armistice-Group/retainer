"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Pencil, Plus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SubmitButton } from "@/components/forms/submit-button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { createMilestoneAction, updateMilestoneAction } from "@/actions/milestones";
import type { ActionState } from "@/actions/auth";

type Kind = "payment" | "deliverable";

/** Adds a milestone, or edits one when `milestone` is given. */
export function AddMilestoneDialog({
  projectId,
  milestone,
  defaultKind = "payment",
}: {
  projectId: string;
  milestone?: {
    id: string;
    name: string;
    description: string | null;
    amount: number;
    billable: boolean;
    dueDate: string | null;
  };
  /** What a new one starts as: projects billed by milestone start with a
   * payment, others with a deliverable. */
  defaultKind?: Kind;
}) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<Kind>(
    milestone ? (milestone.billable ? "payment" : "deliverable") : defaultKind
  );
  const action = milestone
    ? updateMilestoneAction.bind(null, milestone.id, projectId)
    : createMilestoneAction.bind(null, projectId);
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(action, null);
  const wasPending = useRef(false);
  const idp = milestone ? `milestone-${milestone.id}` : "milestone";

  useEffect(() => {
    if (wasPending.current && !isPending && !state?.error && !state?.fieldErrors) {
      setOpen(false);
    }
    wasPending.current = isPending;
  }, [isPending, state]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {milestone ? (
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            aria-label={`Edit "${milestone.name}"`}
            title="Edit"
          >
            <Pencil className="size-3.5" />
          </Button>
        ) : (
          <Button variant="outline" size="sm">
            <Plus className="size-3.5" /> Add
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{milestone ? "Edit" : "Add a milestone or deliverable"}</DialogTitle>
          <DialogDescription>
            A payment milestone is billed once it&apos;s complete. A deliverable is tracked and dated
            the same way but never invoiced.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="flex flex-col gap-4">
          {state?.error ? (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          ) : null}
          <div className="flex flex-col gap-2">
            <Label htmlFor={`${idp}-kind`}>Type</Label>
            <Select name="kind" value={kind} onValueChange={(v) => setKind(v as Kind)}>
              <SelectTrigger id={`${idp}-kind`} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="payment">Payment milestone (billed when complete)</SelectItem>
                <SelectItem value="deliverable">Deliverable (not billed)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor={`${idp}-name`}>Name</Label>
            <Input
              id={`${idp}-name`}
              name="name"
              placeholder={kind === "payment" ? "e.g. Design approval" : "e.g. Final report"}
              defaultValue={milestone?.name}
              required
            />
            {state?.fieldErrors?.name ? (
              <p className="text-sm text-destructive">{state.fieldErrors.name[0]}</p>
            ) : null}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor={`${idp}-description`}>Description</Label>
            <Textarea
              id={`${idp}-description`}
              name="description"
              rows={3}
              defaultValue={milestone?.description ?? ""}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            {kind === "payment" ? (
              <div className="flex flex-col gap-2">
                <Label htmlFor={`${idp}-amount`}>Amount</Label>
                <Input
                  id={`${idp}-amount`}
                  name="amount"
                  type="number"
                  step="0.01"
                  min="0.01"
                  defaultValue={milestone?.billable ? milestone.amount : undefined}
                  required
                />
                {state?.fieldErrors?.amount ? (
                  <p className="text-sm text-destructive">{state.fieldErrors.amount[0]}</p>
                ) : null}
              </div>
            ) : null}
            <div className="flex flex-col gap-2">
              <Label htmlFor={`${idp}-dueDate`}>Due date (optional)</Label>
              <Input
                id={`${idp}-dueDate`}
                name="dueDate"
                type="date"
                defaultValue={milestone?.dueDate?.slice(0, 10) ?? ""}
              />
              {state?.fieldErrors?.dueDate ? (
                <p className="text-sm text-destructive">{state.fieldErrors.dueDate[0]}</p>
              ) : null}
            </div>
          </div>
          <SubmitButton pendingText="Saving...">{milestone ? "Save changes" : "Add"}</SubmitButton>
        </form>
      </DialogContent>
    </Dialog>
  );
}
