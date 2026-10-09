"use client";

import { useTransition } from "react";
import { Play, Square } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { startTimerAction, stopTimerAction } from "@/actions/timer";
import { toISODate } from "@/lib/date";
import { cn } from "@/lib/utils";

/** One-click timer for a task: starts one (stopping and logging whatever
 * was running), or stops this task's timer when it's the one running. */
export function TaskTimerButton({
  taskId,
  projectId,
  running,
  className,
}: {
  taskId: string;
  projectId: string;
  running: boolean;
  className?: string;
}) {
  const [pending, startTransition] = useTransition();

  function toggle() {
    startTransition(async () => {
      const today = toISODate(new Date());
      if (running) {
        const result = await stopTimerAction(today);
        if (result?.error) toast.error(result.error);
        else toast.success("Timer stopped.");
        return;
      }
      const result = await startTimerAction(projectId, taskId, null, true, today);
      if (result?.error) toast.error(result.error);
    });
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className={cn("size-7 shrink-0", running && "text-brand", className)}
      disabled={pending}
      onClick={(e) => {
        e.stopPropagation();
        toggle();
      }}
      aria-label={running ? "Stop timer" : "Start timer on this task"}
      title={running ? "Stop timer" : "Start timer"}
    >
      {running ? <Square className="size-3.5 fill-current" /> : <Play className="size-3.5" />}
    </Button>
  );
}
