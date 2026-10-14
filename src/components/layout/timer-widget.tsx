"use client";

import { useEffect, useMemo, useState, useTransition, type FormEvent, type ReactNode } from "react";
import { Play, Square, Timer as TimerIcon } from "lucide-react";
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
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "sonner";
import {
  startTimerAction,
  stopTimerAction,
  discardTimerAction,
  updateTimerAction,
  type TimerActionState,
} from "@/actions/timer";
import { browserTimeZone } from "@/lib/clock-time";

export type TimerProjectOption = { id: string; name: string; clientName: string };
export type TimerTaskOption = { id: string; title: string; projectId: string };
type ProjectOption = TimerProjectOption;
type TaskOption = TimerTaskOption;

export type ActiveTimerData = {
  startedAt: string;
  description: string | null;
  projectId: string;
  projectName: string;
  taskId: string | null;
  taskTitle: string | null;
  billable?: boolean;
};

// The start dialog offers the project you last timed (on this device).
const LAST_PROJECT_KEY = "timer:lastProjectId";

export function rememberProject(projectId: string) {
  try {
    localStorage.setItem(LAST_PROJECT_KEY, projectId);
  } catch {
    // Private mode: nothing to remember with.
  }
}

export function formatElapsed(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/** Toasts what a timer action did (and any warnings); true if it worked. */
export function reportTimerResult(result: TimerActionState) {
  if (result?.error) {
    toast.error(result.error);
    return false;
  }
  if (result?.message) toast.success(result.message);
  result?.warnings?.forEach((w) => toast.warning(w));
  return true;
}

/** Project, task, description and billable: shared by start and edit. */
function TimerFields({
  projects,
  tasks,
  projectId,
  setProjectId,
  taskId,
  setTaskId,
  description,
  setDescription,
  billable,
  setBillable,
}: {
  projects: ProjectOption[];
  tasks: TaskOption[];
  projectId: string;
  setProjectId: (v: string) => void;
  taskId: string;
  setTaskId: (v: string) => void;
  description: string;
  setDescription: (v: string) => void;
  billable: boolean;
  setBillable: (v: boolean) => void;
}) {
  const availableTasks = useMemo(() => tasks.filter((t) => t.projectId === projectId), [tasks, projectId]);
  return (
    <>
      <div className="flex min-w-0 flex-col gap-2">
        <Label htmlFor="timer-project">Project</Label>
        <Select
          value={projectId}
          onValueChange={(v) => {
            setProjectId(v);
            setTaskId("");
          }}
        >
          <SelectTrigger id="timer-project" className="w-full min-w-0">
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
      </div>
      {availableTasks.length > 0 ? (
        <div className="flex min-w-0 flex-col gap-2">
          <Label htmlFor="timer-task">Task (optional)</Label>
          <Select value={taskId} onValueChange={setTaskId}>
            <SelectTrigger id="timer-task" className="w-full min-w-0">
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
        <Label htmlFor="timer-description">Description (optional)</Label>
        <Input
          id="timer-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What are you working on?"
        />
      </div>
      <div className="flex items-center gap-2">
        <Checkbox id="timer-billable" checked={billable} onCheckedChange={(v) => setBillable(v === true)} />
        <Label htmlFor="timer-billable" className="font-normal">
          Billable
        </Label>
      </div>
    </>
  );
}

function RunningTimer({
  timer,
  projects,
  tasks,
}: {
  timer: ActiveTimerData;
  projects: ProjectOption[];
  tasks: TaskOption[];
}) {
  const startedAt = useMemo(() => new Date(timer.startedAt), [timer.startedAt]);
  // Null until mounted: the server's clock would disagree with the browser's.
  const [now, setNow] = useState<number | null>(null);
  const [isPending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, 1000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, []);

  const elapsed = now == null ? "–:––" : formatElapsed(now - startedAt.getTime());

  return (
    <div className="flex min-w-0 items-center gap-1 rounded-md border border-brand/40 bg-brand/5 py-1 pr-1 pl-1">
      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogTrigger asChild>
          <button
            type="button"
            className="flex min-w-0 items-center gap-2 rounded px-2 py-0.5 text-left hover:bg-brand/10"
            title="Change what you're timing"
          >
            <TimerIcon className="size-3.5 shrink-0 text-brand" />
            <span className="flex min-w-0 flex-col leading-tight">
              <span className="font-mono text-sm font-medium tabular-nums">{elapsed}</span>
              <span className="max-w-40 truncate text-xs text-muted-foreground">
                {timer.projectName}
                {timer.taskTitle ? ` — ${timer.taskTitle}` : ""}
              </span>
            </span>
          </button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Running timer</DialogTitle>
            <DialogDescription>
              Started {startedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}. Change what
              it&apos;s for; the time so far carries over.
            </DialogDescription>
          </DialogHeader>
          {editing ? (
            <EditTimerForm timer={timer} projects={projects} tasks={tasks} onDone={() => setEditing(false)} />
          ) : null}
        </DialogContent>
      </Dialog>
      <Button
        size="sm"
        disabled={isPending}
        onClick={() =>
          startTransition(async () => {
            reportTimerResult(await stopTimerAction(browserTimeZone()));
          })
        }
      >
        <Square className="size-3 fill-current" /> Stop
      </Button>
    </div>
  );
}

export function EditTimerForm({
  timer,
  projects,
  tasks,
  onDone,
}: {
  timer: ActiveTimerData;
  projects: ProjectOption[];
  tasks: TaskOption[];
  onDone: () => void;
}) {
  const [projectId, setProjectId] = useState(timer.projectId);
  const [taskId, setTaskId] = useState(timer.taskId ?? "");
  const [description, setDescription] = useState(timer.description ?? "");
  const [billable, setBillable] = useState(timer.billable ?? true);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function save(e: FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await updateTimerAction(projectId, taskId || null, description || null, billable);
      if (result?.error) return setError(result.error);
      rememberProject(projectId);
      reportTimerResult(result);
      onDone();
    });
  }

  function discard() {
    if (!confirm("Discard this timer? The time won't be logged.")) return;
    startTransition(async () => {
      await discardTimerAction();
      toast.success("Timer discarded");
      onDone();
    });
  }

  return (
    <form onSubmit={save} className="flex min-w-0 flex-col gap-4">
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <TimerFields
        projects={projects}
        tasks={tasks}
        projectId={projectId}
        setProjectId={setProjectId}
        taskId={taskId}
        setTaskId={setTaskId}
        description={description}
        setDescription={setDescription}
        billable={billable}
        setBillable={setBillable}
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button type="button" variant="ghost" className="text-destructive" disabled={isPending} onClick={discard}>
          Discard timer
        </Button>
        <Button type="submit" disabled={isPending || !projectId}>
          {isPending ? "Saving..." : "Save"}
        </Button>
      </div>
    </form>
  );
}

export function StartTimerDialog({
  projects,
  tasks,
  trigger,
}: {
  projects: ProjectOption[];
  tasks: TaskOption[];
  /** Replaces the default "Start timer" button. */
  trigger?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [projectId, setProjectId] = useState("");
  const [taskId, setTaskId] = useState("");
  const [description, setDescription] = useState("");
  const [billable, setBillable] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (!next) return;
    setError(null);
    try {
      const last = localStorage.getItem(LAST_PROJECT_KEY);
      if (!projectId && last && projects.some((p) => p.id === last)) setProjectId(last);
    } catch {
      // No storage: start blank.
    }
  }

  function handleStart(e: FormEvent) {
    e.preventDefault();
    if (!projectId) return setError("Pick a project first.");
    setError(null);
    startTransition(async () => {
      const result = await startTimerAction(
        projectId,
        taskId || null,
        description || null,
        billable,
        browserTimeZone()
      );
      if (result?.error) return setError(result.error);
      rememberProject(projectId);
      reportTimerResult(result);
      setOpen(false);
      setTaskId("");
      setDescription("");
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm" variant="outline">
            <Play className="size-3.5" /> Start timer
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Start timer</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleStart} className="flex min-w-0 flex-col gap-4">
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          <TimerFields
            projects={projects}
            tasks={tasks}
            projectId={projectId}
            setProjectId={setProjectId}
            taskId={taskId}
            setTaskId={setTaskId}
            description={description}
            setDescription={setDescription}
            billable={billable}
            setBillable={setBillable}
          />
          <Button type="submit" disabled={isPending}>
            <Play className="size-3.5" /> {isPending ? "Starting..." : "Start timer"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function TimerWidget({
  activeTimer,
  projects,
  tasks,
}: {
  activeTimer: ActiveTimerData | null;
  projects: ProjectOption[];
  tasks: TaskOption[];
}) {
  if (activeTimer) return <RunningTimer timer={activeTimer} projects={projects} tasks={tasks} />;
  if (projects.length === 0) {
    return (
      <span title="Create a project first">
        <Button size="sm" variant="outline" disabled>
          <Play className="size-3.5" /> Start timer
        </Button>
      </span>
    );
  }
  return <StartTimerDialog projects={projects} tasks={tasks} />;
}
