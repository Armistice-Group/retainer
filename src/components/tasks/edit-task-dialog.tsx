"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Pencil } from "lucide-react";
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
import { updateTaskAction } from "@/actions/tasks";
import type { ActionState } from "@/actions/auth";

export function EditTaskDialog({
  projectId,
  task,
}: {
  projectId: string;
  task: {
    id: string;
    title: string;
    description: string | null;
    estimatedHours: number | null;
    /** YYYY-MM-DD */
    dueDate: string | null;
  };
}) {
  const [open, setOpen] = useState(false);
  const action = updateTaskAction.bind(null, task.id, projectId);
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
        <Button variant="ghost" size="icon" className="size-7" aria-label="Edit task" title="Edit task">
          <Pencil className="size-3.5" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit task</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="flex flex-col gap-4">
          {state?.error ? (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          ) : null}
          <div className="flex flex-col gap-2">
            <Label htmlFor="edit-task-title">Title</Label>
            <Input id="edit-task-title" name="title" defaultValue={task.title} required />
            {state?.fieldErrors?.title ? (
              <p className="text-sm text-destructive">{state.fieldErrors.title[0]}</p>
            ) : null}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="edit-task-description">Description</Label>
            <Textarea
              id="edit-task-description"
              name="description"
              rows={3}
              defaultValue={task.description ?? ""}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="edit-task-due">Due date (optional)</Label>
            <Input id="edit-task-due" name="dueDate" type="date" defaultValue={task.dueDate ?? ""} />
            {state?.fieldErrors?.dueDate ? (
              <p className="text-sm text-destructive">{state.fieldErrors.dueDate[0]}</p>
            ) : null}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="edit-task-estimate">Estimated hours (optional)</Label>
            <Input
              id="edit-task-estimate"
              name="estimatedHours"
              type="number"
              step="0.25"
              min="0"
              defaultValue={task.estimatedHours ?? ""}
              placeholder="For estimate vs. actual"
            />
            {state?.fieldErrors?.estimatedHours ? (
              <p className="text-sm text-destructive">{state.fieldErrors.estimatedHours[0]}</p>
            ) : null}
          </div>
          <SubmitButton pendingText="Saving...">Save changes</SubmitButton>
        </form>
      </DialogContent>
    </Dialog>
  );
}
