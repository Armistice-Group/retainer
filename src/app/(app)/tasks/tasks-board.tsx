"use client";

import Link from "next/link";
import { ChevronDown, MessageSquare, UserRound } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { StatusBadge } from "@/components/status-badge";
import { TaskSheet, useOpenTask } from "@/components/tasks/task-sheet";
import { TaskTimerButton } from "@/components/tasks/task-timer-button";
import type { TaskDetail } from "@/lib/task-detail";

export type TaskGroup = {
  projectId: string;
  projectName: string;
  clientName: string;
  tasks: {
    id: string;
    title: string;
    status: string;
    assigneeName: string | null;
    estimatedHours: number | null;
    actualHours: number;
    commentCount: number;
    linearKey: string | null;
  }[];
};

export function TasksBoard({
  groups,
  openTaskDetail,
  runningTaskId,
}: {
  groups: TaskGroup[];
  openTaskDetail: TaskDetail | null;
  /** Task the viewer's timer is running on, if any. */
  runningTaskId: string | null;
}) {
  const { openTaskId, openTask, closeTask } = useOpenTask();
  const openTitle = groups.flatMap((g) => g.tasks).find((t) => t.id === openTaskId)?.title;

  return (
    <>
      <div className="flex flex-col gap-4">
        {groups.map((group) => (
          <Card key={group.projectId} className="gap-0 py-0">
            <details open className="group/project">
              <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 [&::-webkit-details-marker]:hidden">
                <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-[:not([open])]/project:-rotate-90" />
                <span className="min-w-0 flex-1 truncate text-sm">
                  <span className="text-muted-foreground">{group.clientName} — </span>
                  <Link
                    href={`/projects/${group.projectId}`}
                    className="font-medium hover:underline"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {group.projectName}
                  </Link>
                </span>
                <span className="tabular-figures shrink-0 text-xs text-muted-foreground">
                  {group.tasks.length} {group.tasks.length === 1 ? "task" : "tasks"}
                </span>
              </summary>
              <ul className="flex flex-col divide-y divide-border border-t border-border">
                {group.tasks.map((task) => (
                  <li key={task.id} className="flex items-center pr-2">
                    <button
                      type="button"
                      onClick={() => openTask(task.id)}
                      aria-current={task.id === openTaskId ? "true" : undefined}
                      className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-left text-sm transition-colors hover:bg-accent/50 aria-[current]:bg-accent/60 sm:flex-nowrap"
                    >
                      <span className="w-24 shrink-0">
                        <StatusBadge status={task.status} />
                      </span>
                      <span className="min-w-0 flex-1 basis-full truncate sm:basis-auto">
                        {task.linearKey ? (
                          <span className="mr-2 font-mono text-xs text-muted-foreground">
                            {task.linearKey}
                          </span>
                        ) : null}
                        {task.title}
                      </span>
                      {task.commentCount > 0 ? (
                        <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                          <MessageSquare className="size-3" />
                          {task.commentCount}
                        </span>
                      ) : null}
                      <span
                        className={cn(
                          "tabular-figures shrink-0 text-xs text-muted-foreground sm:w-24 sm:text-right",
                          task.estimatedHours !== null &&
                            task.actualHours > task.estimatedHours &&
                            "font-medium text-destructive"
                        )}
                      >
                        {task.actualHours.toFixed(2)}
                        {task.estimatedHours ? ` / ${task.estimatedHours.toFixed(2)}` : ""}h
                      </span>
                      <span className="flex shrink-0 items-center gap-1.5 truncate text-xs sm:w-32 text-muted-foreground">
                        <UserRound className="size-3.5 shrink-0" />
                        <span className="truncate">{task.assigneeName ?? "Unassigned"}</span>
                      </span>
                    </button>
                    <TaskTimerButton
                      taskId={task.id}
                      projectId={group.projectId}
                      running={task.id === runningTaskId}
                    />
                  </li>
                ))}
              </ul>
            </details>
          </Card>
        ))}
      </div>
      <TaskSheet
        taskId={openTaskId}
        title={openTitle}
        detail={openTaskDetail}
        showProject
        onClose={closeTask}
      />
    </>
  );
}
