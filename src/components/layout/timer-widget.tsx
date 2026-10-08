"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Play, Square, X, Timer as TimerIcon } from "lucide-react";
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
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { startTimerAction, stopTimerAction, discardTimerAction } from "@/actions/timer";
import { toISODate } from "@/lib/date";

type ProjectOption = { id: string; name: string; clientName: string };
type TaskOption = { id: string; title: string; projectId: string };

export type ActiveTimerData = {
  startedAt: string;
  description: string | null;
  projectId: string;
  projectName: string;
  taskId: string | null;
  taskTitle: string | null;
};

function formatElapsed(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

function RunningTimer({ timer }: { timer: ActiveTimerData }) {
  const startedAt = useMemo(() => new Date(timer.startedAt), [timer.startedAt]);
  const [now, setNow] = useState(() => new Date());
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="flex items-center gap-2 rounded-md border border-brand/40 bg-brand/5 py-1 pr-1 pl-3">
      <TimerIcon className="size-3.5 text-brand" />
      <div className="flex flex-col leading-tight">
        <span className="font-mono text-sm font-medium tabular-nums">
          {formatElapsed(now.getTime() - startedAt.getTime())}
        </span>
        <span className="max-w-40 truncate text-xs text-muted-foreground">
          {timer.projectName}
          {timer.taskTitle ? ` — ${timer.taskTitle}` : ""}
        </span>
      </div>
      <Button
        size="icon"
        variant="ghost"
        className="size-7"
        disabled={isPending}
        title="Discard without logging"
        onClick={() => startTransition(() => discardTimerAction())}
      >
        <X className="size-3.5" />
      </Button>
      <Button
        size="sm"
        disabled={isPending}
        onClick={() => startTransition(() => stopTimerAction(toISODate(new Date())))}
      >
        <Square className="size-3 fill-current" /> Stop
      </Button>
    </div>
  );
}

function StartTimerDialog({
  projects,
  tasks,
}: {
  projects: ProjectOption[];
  tasks: TaskOption[];
}) {
  const [open, setOpen] = useState(false);
  const [projectId, setProjectId] = useState("");
  const [taskId, setTaskId] = useState("");
  const [description, setDescription] = useState("");
  const [billable, setBillable] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const availableTasks = useMemo(
    () => tasks.filter((t) => t.projectId === projectId),
    [tasks, projectId]
  );

  function handleStart() {
    if (!projectId) {
      setError("Pick a project first.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await startTimerAction(
        projectId,
        taskId || null,
        description || null,
        billable,
        toISODate(new Date())
      );
      if (result?.error) {
        setError(result.error);
        return;
      }
      setOpen(false);
      setProjectId("");
      setTaskId("");
      setDescription("");
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Play className="size-3.5" /> Start timer
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Start timer</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          <div className="flex flex-col gap-2">
            <Label htmlFor="timer-project">Project</Label>
            <Select value={projectId} onValueChange={(v) => { setProjectId(v); setTaskId(""); }}>
              <SelectTrigger id="timer-project" className="w-full">
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
            <div className="flex flex-col gap-2">
              <Label htmlFor="timer-task">Task (optional)</Label>
              <Select value={taskId} onValueChange={setTaskId}>
                <SelectTrigger id="timer-task" className="w-full">
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
            <Checkbox
              id="timer-billable"
              checked={billable}
              onCheckedChange={(v) => setBillable(v === true)}
            />
            <Label htmlFor="timer-billable" className="font-normal">
              Billable
            </Label>
          </div>
          <Button onClick={handleStart} disabled={isPending || !projectId}>
            <Play className="size-3.5" /> {isPending ? "Starting..." : "Start timer"}
          </Button>
        </div>
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
  if (projects.length === 0) return null;

  return activeTimer ? (
    <RunningTimer timer={activeTimer} />
  ) : (
    <StartTimerDialog projects={projects} tasks={tasks} />
  );
}
