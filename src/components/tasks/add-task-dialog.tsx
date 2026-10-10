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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SubmitButton } from "@/components/forms/submit-button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { createTaskAction } from "@/actions/tasks";
import type { ActionState } from "@/actions/auth";

export type AddTaskProject = {
  id: string;
  /** Shown in the project picker when there's more than one project. */
  label: string;
  members: { id: string; name: string }[];
};

export function AddTaskDialog({
  projects,
  triggerLabel = "Add task",
}: {
  /** One project adds the task there; several show a project picker. */
  projects: AddTaskProject[];
  triggerLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [projectId, setProjectId] = useState(projects.length === 1 ? projects[0].id : "");
  const members = projects.find((p) => p.id === projectId)?.members ?? [];
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(
    createTaskAction,
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
          <Plus className="size-3.5" /> {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a task</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="flex flex-col gap-4">
          {state?.error ? (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          ) : null}
          {projects.length === 1 ? (
            <input type="hidden" name="projectId" value={projectId} />
          ) : (
            <div className="flex flex-col gap-2">
              <Label htmlFor="task-project">Project</Label>
              <Select name="projectId" value={projectId} onValueChange={setProjectId}>
                <SelectTrigger id="task-project" className="w-full">
                  <SelectValue placeholder="Select a project" />
                </SelectTrigger>
                <SelectContent>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {state?.fieldErrors?.projectId ? (
                <p className="text-sm text-destructive">Pick a project.</p>
              ) : null}
            </div>
          )}
          <div className="flex flex-col gap-2">
            <Label htmlFor="task-title">Title</Label>
            <Input id="task-title" name="title" required />
            {state?.fieldErrors?.title ? (
              <p className="text-sm text-destructive">{state.fieldErrors.title[0]}</p>
            ) : null}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="task-description">Description</Label>
            <Textarea id="task-description" name="description" rows={3} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="task-due">Due date (optional)</Label>
            <Input id="task-due" name="dueDate" type="date" />
            {state?.fieldErrors?.dueDate ? (
              <p className="text-sm text-destructive">{state.fieldErrors.dueDate[0]}</p>
            ) : null}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="task-estimate">Estimated hours (optional)</Label>
            <Input
              id="task-estimate"
              name="estimatedHours"
              type="number"
              step="0.25"
              min="0"
              placeholder="For estimate vs. actual"
            />
            {state?.fieldErrors?.estimatedHours ? (
              <p className="text-sm text-destructive">{state.fieldErrors.estimatedHours[0]}</p>
            ) : null}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="task-assignee">Assignee (optional)</Label>
            <Select
              key={projectId}
              name="assigneeId"
              defaultValue={members.length === 1 ? members[0].id : undefined}
            >
              <SelectTrigger id="task-assignee" className="w-full">
                <SelectValue placeholder="Unassigned" />
              </SelectTrigger>
              <SelectContent>
                {members.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <SubmitButton pendingText="Adding...">Add task</SubmitButton>
        </form>
      </DialogContent>
    </Dialog>
  );
}
