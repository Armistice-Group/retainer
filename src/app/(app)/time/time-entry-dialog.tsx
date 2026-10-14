"use client";

import {
  useActionState,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type FormEvent,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
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
  formatClockTime,
  formatSpan,
  maxClockHours,
  parseLooseClockTime,
} from "@/lib/clock-time";
import { EvidencePicker } from "@/components/time-evidence";
import type { ActionState } from "@/actions/auth";

type ProjectOption = {
  id: string;
  name: string;
  clientName: string;
  /** The client wants start and end times on every entry. */
  requireClockTimes?: boolean;
  /** The client's invoices show time detail (so evidence can be shared). */
  invoiceTimeDetail?: boolean;
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

type DialogProps = {
  projects: ProjectOption[];
  tasks?: TaskOption[];
  editValues?: EditValues;
  defaultDate?: string;
  canManageTeam?: boolean;
  teamMembers?: MemberOption[];
  /** Who "Assigned to" starts as for a new entry (the person logging). */
  currentUserId?: string;
  defaultProjectId?: string;
  defaultTaskId?: string;
  /** The org's "Round clock times to", in minutes. */
  clockRounding?: number;
  /** Shown at the top, e.g. why the viewed week can't take new time. */
  notice?: string;
  /** Replaces the default "Log time" button. */
  trigger?: ReactNode;
  /** Open as soon as the page loads (e.g. /time?log=1). */
  defaultOpen?: boolean;
};

const dayLabel = (iso: string) =>
  new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }).format(
    new Date(`${iso}T00:00:00Z`)
  );

export function TimeEntryDialog(props: DialogProps) {
  const { editValues, trigger, defaultOpen } = props;
  const [open, setOpen] = useState(!!defaultOpen);
  // A fresh form (and action state) each time it opens: no stale errors.
  const [session, setSession] = useState(0);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setSession((n) => n + 1);
      }}
    >
      <DialogTrigger asChild>
        {trigger ? (
          trigger
        ) : editValues ? (
          <Button variant="ghost" size="icon" className="size-7" aria-label="Edit time entry" title="Edit">
            <Pencil className="size-3.5" />
          </Button>
        ) : (
          <Button>
            <Plus className="size-4" /> Log time
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-x-hidden overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editValues ? "Edit time entry" : "Log time"}</DialogTitle>
        </DialogHeader>
        {open ? <TimeEntryForm key={session} {...props} onDone={() => setOpen(false)} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function TimeEntryForm({
  projects,
  tasks = [],
  editValues,
  defaultDate,
  canManageTeam = false,
  teamMembers = [],
  currentUserId,
  defaultProjectId,
  defaultTaskId,
  clockRounding = 15,
  notice,
  onDone,
}: DialogProps & { onDone: () => void }) {
  const router = useRouter();
  const knownDefault = projects.some((p) => p.id === defaultProjectId) ? defaultProjectId : undefined;
  const [projectId, setProjectId] = useState(editValues?.projectId ?? knownDefault ?? "");
  const action = editValues ? updateTimeEntryAction.bind(null, editValues.id) : createTimeEntryAction;
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(action, null);
  const [, startTransition] = useTransition();
  const [evidence, setEvidence] = useState<File[]>([]);
  const submitted = useRef<{ date: string; hours: string } | null>(null);
  const wasPending = useRef(false);

  useEffect(() => {
    if (wasPending.current && !isPending && !state?.error && !state?.fieldErrors && submitted.current) {
      const { date, hours } = submitted.current;
      const project = projects.find((p) => p.id === projectId);
      const what = `${Number(hours) || ""}${Number(hours) ? "h" : "Time"} on ${project?.clientName ?? ""} — ${project?.name ?? ""}`;
      toast.success(editValues ? `Saved ${what}, ${dayLabel(date)}` : `Logged ${what}, ${dayLabel(date)}`, {
        action: { label: "View week", onClick: () => router.push(`/time?week=${date}`) },
      });
      // Saved anyway; overlapping time is worth a look.
      state?.warnings?.forEach((w) => toast.warning(w));
      onDone();
    }
    wasPending.current = isPending;
  }, [isPending, state, editValues, onDone, projectId, projects, router]);

  // Submitting by hand rather than through <form action> keeps everything
  // typed (and the evidence) in place when the server refuses the entry.
  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    for (const field of ["startTime", "endTime"]) {
      const minute = parseLooseClockTime(String(data.get(field) ?? ""));
      if (minute != null) data.set(field, formatClockTime(minute));
    }
    data.delete("attachments");
    evidence.forEach((file) => data.append("attachments", file));
    submitted.current = { date: String(data.get("date") ?? ""), hours: String(data.get("hours") ?? "") };
    startTransition(() => formAction(data));
  }

  const requireClockTimes = !!projects.find((p) => p.id === projectId)?.requireClockTimes;
  const showTeamFields = canManageTeam && teamMembers.length > 1;
  const availableTasks = useMemo(() => tasks.filter((t) => t.projectId === projectId), [tasks, projectId]);

  return (
    <form onSubmit={onSubmit} className="flex min-w-0 flex-col gap-4">
      {notice ? (
        <Alert>
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      ) : null}
      {state?.error ? (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}
      <div className="flex min-w-0 flex-col gap-2">
        <Label htmlFor="te-project">Project</Label>
        <Select name="projectId" value={projectId} onValueChange={setProjectId}>
          <SelectTrigger id="te-project" className="w-full min-w-0">
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
        <div className="flex min-w-0 flex-col gap-2">
          <Label htmlFor="te-task">Task (optional)</Label>
          <Select name="taskId" defaultValue={editValues?.taskId || defaultTaskId}>
            <SelectTrigger id="te-task" className="w-full min-w-0">
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
        focusHours={!editValues && !!projectId}
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
      <EvidencePicker
        files={evidence}
        onChange={setEvidence}
        canShare={!!projects.find((p) => p.id === projectId)?.invoiceTimeDetail}
        error={state?.fieldErrors?.attachments?.[0]} />
      <div className="flex items-center gap-2">
        <Checkbox id="te-billable" name="billable" defaultChecked={editValues ? editValues.billable : true} />
        <Label htmlFor="te-billable" className="font-normal">
          Billable
        </Label>
      </div>

      {showTeamFields ? (
        <div className="grid grid-cols-1 gap-4 rounded-md border border-dashed border-border p-3 sm:grid-cols-2">
          <div className="flex min-w-0 flex-col gap-2">
            <Label htmlFor="te-user">Whose time</Label>
            <Select name="userId" defaultValue={editValues?.userId ?? currentUserId}>
              <SelectTrigger id="te-user" className="w-full min-w-0">
                <SelectValue placeholder="You" />
              </SelectTrigger>
              <SelectContent>
                {teamMembers.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.id === currentUserId ? `${m.name} (you)` : m.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex min-w-0 flex-col gap-2">
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
          <p className="text-xs text-muted-foreground sm:col-span-2">
            Owners and admins only. Leave the rate blank to use the person&apos;s standard project rate.
          </p>
        </div>
      ) : canManageTeam && editValues?.rateOverride ? (
        // Keep an existing override when the fields aren't shown.
        <input type="hidden" name="rateOverride" value={editValues.rateOverride} />
      ) : null}

      <SubmitButton pendingText="Saving..." pending={isPending}>{editValues ? "Save changes" : "Log time"}</SubmitButton>
    </form>
  );
}

/**
 * Start, End and Hours. Filling both times works out the hours (rounded to
 * the org's increment); hours stay editable, e.g. to take off a break, but
 * can't be more than the time between them. Times can be typed loosely
 * ("930", "2pm") and are tidied to HH:MM when you leave the field.
 */
function ClockFields({
  editValues,
  rounding,
  required,
  fieldErrors,
  focusHours,
}: {
  editValues?: EditValues;
  rounding: number;
  required: boolean;
  fieldErrors?: Record<string, string[]>;
  focusHours: boolean;
}) {
  const [startTime, setStartTime] = useState(editValues?.startTime ?? "");
  const [endTime, setEndTime] = useState(editValues?.endTime ?? "");
  const [hours, setHours] = useState(editValues?.hours ?? "");

  const start = startTime ? parseLooseClockTime(startTime) : null;
  const end = endTime ? parseLooseClockTime(endTime) : null;
  const timed = start != null && end != null;
  const span = timed ? clockSpanMinutes(start, end) : null;
  const maxHours = timed ? maxClockHours(start, end, rounding) : null;
  const tooLong = maxHours != null && hours !== "" && Number(hours) > maxHours;

  function changeTime(nextStart: string, nextEnd: string) {
    setStartTime(nextStart);
    setEndTime(nextEnd);
    const s = nextStart ? parseLooseClockTime(nextStart) : null;
    const e = nextEnd ? parseLooseClockTime(nextEnd) : null;
    if (s != null && e != null) setHours(String(clockHours(clockSpanMinutes(s, e), rounding)));
  }

  const badTime =
    (startTime && start == null) || (endTime && end == null) ? "Use a time like 09:30, 930 or 2pm." : null;
  const timeError = badTime ?? fieldErrors?.startTime?.[0] ?? fieldErrors?.endTime?.[0];
  const hoursError = tooLong
    ? `Can't be more than the time between start and end (${maxHours}h).`
    : fieldErrors?.hours?.[0];
  const rounded = span != null && hours !== "" && Number(hours) !== Math.round((span / 60) * 100) / 100;

  const timeInput = (id: string, name: string, label: string, value: string, other: string, first: boolean) => (
    <div className="flex min-w-0 flex-col gap-2">
      <Label htmlFor={id}>
        {label}
        {required ? "" : " (optional)"}
      </Label>
      <Input
        id={id}
        name={name}
        inputMode="text"
        autoComplete="off"
        placeholder="09:00"
        value={value}
        onChange={(e) => (first ? changeTime(e.target.value, endTime) : changeTime(startTime, e.target.value))}
        onBlur={() => {
          const parsed = value ? parseLooseClockTime(value) : null;
          if (parsed != null) {
            const tidy = formatClockTime(parsed);
            if (first) changeTime(tidy, endTime);
            else changeTime(startTime, tidy);
          }
        }}
        required={required || !!other}
        aria-invalid={(value && parseLooseClockTime(value) == null) || undefined}
      />
    </div>
  );

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-[1fr_1fr_5rem]">
        {timeInput("te-start", "startTime", "Start", startTime, endTime, true)}
        {timeInput("te-end", "endTime", "End", endTime, startTime, false)}
        <div className="col-span-2 flex min-w-0 flex-col gap-2 sm:col-span-1">
          <Label htmlFor="te-hours">Hours</Label>
          <Input
            id="te-hours"
            name="hours"
            type="number"
            step="0.01"
            min="0.01"
            max="24"
            value={hours}
            autoFocus={focusHours}
            onChange={(e) => setHours(e.target.value)}
            aria-invalid={tooLong || undefined}
            required={!timed}
          />
        </div>
      </div>
      {timed && span != null ? (
        <p className="text-xs text-muted-foreground">
          {formatSpan(span)}
          {endsNextDay(start, end) ? ", ending the next day" : ""}
          {rounded && !tooLong && Number(hours) === clockHours(span, rounding)
            ? ` (rounded to the nearest ${rounding} min).`
            : "."}
        </p>
      ) : null}
      {required ? (
        <p className="text-xs text-muted-foreground">This client needs a start and end time on every entry.</p>
      ) : null}
      {timeError ? <p className="text-sm text-destructive">{timeError}</p> : null}
      {hoursError ? <p className="text-sm text-destructive">{hoursError}</p> : null}
    </div>
  );
}
