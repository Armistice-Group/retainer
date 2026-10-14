"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Pencil, Play, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  EditTimerForm,
  StartTimerDialog,
  formatElapsed,
  rememberProject,
  reportTimerResult,
  type ActiveTimerData,
  type TimerProjectOption,
  type TimerTaskOption,
} from "@/components/layout/timer-widget";
import { startTimerAction, stopTimerAction } from "@/actions/timer";
import { browserTimeZone } from "@/lib/clock-time";

/** The timer, big enough for a thumb: running (time, Stop, change), or
 * stopped with one-tap starts for your recent projects. */
export function PhoneTimer({
  timer,
  projects,
  tasks,
  recentProjectIds,
}: {
  timer: ActiveTimerData | null;
  projects: TimerProjectOption[];
  tasks: TimerTaskOption[];
  recentProjectIds: string[];
}) {
  const [isPending, startTransition] = useTransition();

  if (timer) return <Running timer={timer} projects={projects} tasks={tasks} />;

  const recent = recentProjectIds
    .map((id) => projects.find((p) => p.id === id))
    .filter((p): p is TimerProjectOption => !!p);

  return (
    <section aria-label="Timer" className="rounded-xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-medium">Timer</h2>
        <span className="text-xs text-muted-foreground">Not running</span>
      </div>
      {projects.length === 0 ? (
        <p className="text-sm text-muted-foreground">Create a project in the full app to start timing.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {recent.map((p) => (
            <Button
              key={p.id}
              variant="outline"
              className="h-auto justify-start py-2.5 text-left"
              disabled={isPending}
              onClick={() =>
                startTransition(async () => {
                  const result = await startTimerAction(p.id, null, null, true, browserTimeZone());
                  if (reportTimerResult(result)) rememberProject(p.id);
                })
              }
            >
              <Play className="size-4 shrink-0 text-brand" />
              <span className="flex min-w-0 flex-col">
                <span className="truncate font-medium">{p.name}</span>
                <span className="truncate text-xs font-normal text-muted-foreground">{p.clientName}</span>
              </span>
            </Button>
          ))}
          <StartTimerDialog
            projects={projects}
            tasks={tasks}
            trigger={
              <Button variant={recent.length ? "ghost" : "default"} className="h-11">
                <Play className="size-4" /> {recent.length ? "Another project…" : "Start timer"}
              </Button>
            }
          />
        </div>
      )}
    </section>
  );
}

function Running({
  timer,
  projects,
  tasks,
}: {
  timer: ActiveTimerData;
  projects: TimerProjectOption[];
  tasks: TimerTaskOption[];
}) {
  const startedAt = useMemo(() => new Date(timer.startedAt), [timer.startedAt]);
  const [now, setNow] = useState<number | null>(null);
  const [editing, setEditing] = useState(false);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, 1000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, []);

  return (
    <section aria-label="Timer" className="rounded-xl border border-brand/40 bg-brand/5 p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-medium">{timer.projectName}</p>
          {timer.taskTitle ? <p className="truncate text-sm text-muted-foreground">{timer.taskTitle}</p> : null}
          {timer.description ? (
            <p className="truncate text-sm text-muted-foreground">{timer.description}</p>
          ) : null}
        </div>
        <Dialog open={editing} onOpenChange={setEditing}>
          <DialogTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Change what you're timing">
              <Pencil className="size-4" />
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Running timer</DialogTitle>
              <DialogDescription>
                Started {startedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}. The time so far
                carries over.
              </DialogDescription>
            </DialogHeader>
            {editing ? (
              <EditTimerForm timer={timer} projects={projects} tasks={tasks} onDone={() => setEditing(false)} />
            ) : null}
          </DialogContent>
        </Dialog>
      </div>
      <p className="my-4 text-center font-mono text-5xl font-medium tabular-nums" aria-live="off">
        {now == null ? "–:––" : formatElapsed(now - startedAt.getTime())}
      </p>
      <Button
        className="h-12 w-full text-base"
        disabled={isPending}
        onClick={() =>
          startTransition(async () => {
            reportTimerResult(await stopTimerAction(browserTimeZone()));
          })
        }
      >
        <Square className="size-4 fill-current" /> {isPending ? "Stopping…" : "Stop and log"}
      </Button>
    </section>
  );
}
