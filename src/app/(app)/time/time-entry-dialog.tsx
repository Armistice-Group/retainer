"use client";

import { useActionState, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
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
import { toast } from "sonner";
import {
  clockHours,
  clockSpanMinutes,
  endsNextDay,
  maxClockHours,
  parseClockTime,
} from "@/lib/clock-time";
import { EvidencePicker } from "@/components/time-evidence";
import type { ActionState } from "@/actions/auth";

type ProjectOption = {
  id: string;
  name: string;
  clientName: string;
  /** The client wants start and end times on every entry. */
  requireClockTimes?: boolean;
};
type TaskOption = { id: string; title: string; projectId: string };
type MemberOption = { id: string; name: string };

type EditValues = {
  id: string;
  projectId: string;
  taskId: string;
  date: string;
  hours: string;
  /** "HH:MM", or "" when the entry has no times. */
  startTime: string;
  endTime: string;
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
  defaultProjectId,
  defaultTaskId,
  clockRounding = 15,
  trigger,
}: {
  projects: ProjectOption[];
  tasks?: TaskOption[];
  editValues?: EditValues;
  defaultDate?: string;
  canManageTeam?: boolean;
  teamMembers?: MemberOption[];
  defaultProjectId?: string;
  defaultTaskId?: string;
  /** The org's "Round clock times to", in minutes. */
  clockRounding?: number;
  /** Replaces the default "Log time" button. */
  trigger?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [projectId, setProjectId] = useState(editValues?.projectId ?? defaultProjectId ?? "");
  const action = editValues
    ? updateTimeEntryAction.bind(null, editValues.id)
    : createTimeEntryAction;
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(action, null);
  const wasPending = useRef(false);

  useEffect(() => {
    if (wasPending.current && !isPending && !state?.error && !state?.fieldErrors) {
      setOpen(false);
      // Saved anyway; overlapping time is worth a look.
      state?.warnings?.forEach((w) => toast.warning(w));
    }
    wasPending.current = isPending;
  }, [isPending, state]);

  const requireClockTimes = !!projects.find((p) => p.id === projectId)?.requireClockTimes;

  const availableTasks = useMemo(
    () => tasks.filter((t) => t.projectId === projectId),
    [tasks, projectId]
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ? (
          trigger
        ) : editValues ? (
          <Button variant="ghost" size="icon" className="size-7">
            <Pencil className="size-3.5" />
          </Button>
        ) : (
          <Button>
            <Plus className="size-4" /> Log time
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
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
              <Select name="taskId" defaultValue={editValues?.taskId ?? defaultTaskId}>
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

          <div className="flex flex-col gap-2">
            <Label htmlFor="te-date">Date</Label>
            <Input
              id="te-date"
              name="date"
              type="date"
              className="sm:w-1/2"
              defaultValue={editValues?.date ?? defaultDate ?? toISODate(new Date())}
              required
            />
          </div>
          <ClockFields
            editValues={editValues}
            rounding={clockRounding}
            required={requireClockTimes}
            fieldErrors={state?.fieldErrors}
          />
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
          <EvidencePicker error={state?.fieldErrors?.attachments?.[0]} />
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

/**
 * Start, End and Hours. Filling both times works out the hours (rounded to
 * the org's increment); hours stay editable, e.g. to take off a break, but
 * can't be more than the time between them.
 */
function ClockFields({
  editValues,
  rounding,
  required,
  fieldErrors,
}: {
  editValues?: EditValues;
  rounding: number;
  required: boolean;
  fieldErrors?: Record<string, string[]>;
}) {
  const [startTime, setStartTime] = useState(editValues?.startTime ?? "");
  const [endTime, setEndTime] = useState(editValues?.endTime ?? "");
  const [hours, setHours] = useState(editValues?.hours ?? "");

  const start = startTime ? parseClockTime(startTime) : null;
  const end = endTime ? parseClockTime(endTime) : null;
  const timed = start != null && end != null;
  const maxHours = timed ? maxClockHours(start, end, rounding) : null;
  const tooLong = maxHours != null && hours !== "" && Number(hours) > maxHours;

  function changeTime(nextStart: string, nextEnd: string) {
    setStartTime(nextStart);
    setEndTime(nextEnd);
    const s = nextStart ? parseClockTime(nextStart) : null;
    const e = nextEnd ? parseClockTime(nextEnd) : null;
    if (s != null && e != null) setHours(String(clockHours(clockSpanMinutes(s, e), rounding)));
  }

  const timeError = fieldErrors?.startTime?.[0] ?? fieldErrors?.endTime?.[0];
  const hoursError = tooLong
    ? `Can't be more than the time between start and end (${maxHours}h).`
    : fieldErrors?.hours?.[0];

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-[1fr_1fr_4.5rem] gap-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="te-start">Start{required ? "" : " (optional)"}</Label>
          <Input
            id="te-start"
            name="startTime"
            type="time"
            value={startTime}
            onChange={(e) => changeTime(e.target.value, endTime)}
            required={required || !!endTime}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="te-end">End{required ? "" : " (optional)"}</Label>
          <Input
            id="te-end"
            name="endTime"
            type="time"
            value={endTime}
            onChange={(e) => changeTime(startTime, e.target.value)}
            required={required || !!startTime}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="te-hours">Hours</Label>
          <Input
            id="te-hours"
            name="hours"
            type="number"
            step="0.01"
            min="0"
            max="24"
            value={hours}
            onChange={(e) => setHours(e.target.value)}
            aria-invalid={tooLong || undefined}
            required={!timed}
          />
        </div>
      </div>
      {timed && endsNextDay(start, end) ? (
        <p className="text-xs text-muted-foreground">Ends the next day.</p>
      ) : null}
      {required ? (
        <p className="text-xs text-muted-foreground">
          This client needs a start and end time on every entry.
        </p>
      ) : null}
      {timeError ? <p className="text-sm text-destructive">{timeError}</p> : null}
      {hoursError ? <p className="text-sm text-destructive">{hoursError}</p> : null}
    </div>
  );
}
