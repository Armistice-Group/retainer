"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { Plus, Pencil } from "lucide-react";
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
import { createTimeEntryAction, updateTimeEntryAction } from "@/actions/time-entries";
import { toISODate } from "@/lib/date";
import type { ActionState } from "@/actions/auth";

type ProjectOption = { id: string; name: string; clientName: string };
type TaskOption = { id: string; title: string; projectId: string };
type MemberOption = { id: string; name: string };

type EditValues = {
  id: string;
  projectId: string;
  taskId: string;
  date: string;
  hours: string;
  description: string;
  billable: boolean;
  userId: string;
  rateOverride: string;
};

export function TimeEntryDialog({
  projects,
  tasks = [],
  editValues,
  defaultDate,
  canManageTeam = false,
  teamMembers = [],
}: {
  projects: ProjectOption[];
  tasks?: TaskOption[];
  editValues?: EditValues;
  defaultDate?: string;
  canManageTeam?: boolean;
  teamMembers?: MemberOption[];
}) {
  const [open, setOpen] = useState(false);
  const [projectId, setProjectId] = useState(editValues?.projectId ?? "");
  const action = editValues
    ? updateTimeEntryAction.bind(null, editValues.id)
    : createTimeEntryAction;
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(action, null);
  const wasPending = useRef(false);

  useEffect(() => {
    if (wasPending.current && !isPending && !state?.error && !state?.fieldErrors) {
      setOpen(false);
    }
    wasPending.current = isPending;
  }, [isPending, state]);

  const availableTasks = useMemo(
    () => tasks.filter((t) => t.projectId === projectId),
    [tasks, projectId]
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {editValues ? (
          <Button variant="ghost" size="icon" className="size-7">
            <Pencil className="size-3.5" />
          </Button>
        ) : (
          <Button>
            <Plus className="size-4" /> Log time
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editValues ? "Edit time entry" : "Log time"}</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="flex flex-col gap-4">
          {state?.error ? (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          ) : null}
          <div className="flex flex-col gap-2">
            <Label htmlFor="te-project">Project</Label>
            <Select name="projectId" value={projectId} onValueChange={setProjectId}>
              <SelectTrigger id="te-project" className="w-full">
                <SelectValue placeholder="Select a project" />
              </SelectTrigger>
              <SelectContent>
                {projects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.clientName} — {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {state?.fieldErrors?.projectId ? (
              <p className="text-sm text-destructive">{state.fieldErrors.projectId[0]}</p>
            ) : null}
          </div>

          {availableTasks.length > 0 ? (
            <div className="flex flex-col gap-2">
              <Label htmlFor="te-task">Task (optional)</Label>
              <Select name="taskId" defaultValue={editValues?.taskId}>
                <SelectTrigger id="te-task" className="w-full">
                  <SelectValue placeholder="No specific task" />
                </SelectTrigger>
                <SelectContent>
                  {availableTasks.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="te-date">Date</Label>
              <Input
                id="te-date"
                name="date"
                type="date"
                defaultValue={editValues?.date ?? defaultDate ?? toISODate(new Date())}
                required
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="te-hours">Hours</Label>
              <Input
                id="te-hours"
                name="hours"
                type="number"
                step="0.25"
                min="0"
                max="24"
                defaultValue={editValues?.hours}
                required
              />
              {state?.fieldErrors?.hours ? (
                <p className="text-sm text-destructive">{state.fieldErrors.hours[0]}</p>
              ) : null}
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="te-description">Description</Label>
            <Textarea
              id="te-description"
              name="description"
              rows={3}
              defaultValue={editValues?.description}
              placeholder="What did you work on?"
            />
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="te-billable"
              name="billable"
              defaultChecked={editValues ? editValues.billable : true}
            />
            <Label htmlFor="te-billable" className="font-normal">
              Billable
            </Label>
          </div>

          {canManageTeam ? (
            <div className="grid grid-cols-2 gap-4 rounded-md border border-dashed border-border p-3">
              <div className="flex flex-col gap-2">
                <Label htmlFor="te-user">Assigned to</Label>
                <Select name="userId" defaultValue={editValues?.userId}>
                  <SelectTrigger id="te-user" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {teamMembers.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="te-rate-override">Rate override</Label>
                <Input
                  id="te-rate-override"
                  name="rateOverride"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="Standard rate"
                  defaultValue={editValues?.rateOverride}
                />
              </div>
              <p className="col-span-2 text-xs text-muted-foreground">
                Owner/admin only. Leave the rate blank to use the person&apos;s standard project
                rate.
              </p>
            </div>
          ) : null}

          <SubmitButton pendingText="Saving...">
            {editValues ? "Save changes" : "Log time"}
          </SubmitButton>
        </form>
      </DialogContent>
    </Dialog>
  );
}
