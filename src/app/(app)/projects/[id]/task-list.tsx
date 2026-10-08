"use client";

import { useTransition } from "react";
import { Trash2, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/status-badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { updateTaskStatusAction, assignTaskAction, deleteTaskAction } from "@/actions/tasks";
import { EditTaskDialog } from "@/components/tasks/edit-task-dialog";
import { TaskSheet, useOpenTask } from "@/components/tasks/task-sheet";
import { LinearKeyBadge } from "@/components/tasks/linear-key-badge";
import type { TaskDetail } from "@/lib/task-detail";

const STATUS_ORDER = ["TODO", "IN_PROGRESS", "DONE"] as const;

export type TaskItem = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  assigneeId: string | null;
  assigneeName: string | null;
  estimatedHours: number | null;
  actualHours: number;
  linearKey: string | null;
  linearUrl: string | null;
};

export function TaskList({
  projectId,
  tasks,
  members,
  openTaskDetail,
}: {
  projectId: string;
  tasks: TaskItem[];
  members: { id: string; name: string }[];
  /** Details of the task in `?task=`, loaded by the page. */
  openTaskDetail: TaskDetail | null;
}) {
  const [isPending, startTransition] = useTransition();
  const { openTaskId, openTask, closeTask } = useOpenTask();

  function cycleStatus(task: TaskItem) {
    const idx = STATUS_ORDER.indexOf(task.status as (typeof STATUS_ORDER)[number]);
    const next = STATUS_ORDER[(idx + 1) % STATUS_ORDER.length];
    startTransition(() => updateTaskStatusAction(task.id, projectId, next));
  }

  const sheet = (
    <TaskSheet
      taskId={openTaskId}
      title={tasks.find((t) => t.id === openTaskId)?.title}
      detail={openTaskDetail}
      onClose={closeTask}
    />
  );

  if (tasks.length === 0) {
    return (
      <>
        <p className="text-sm text-muted-foreground">No tasks yet.</p>
        {sheet}
      </>
    );
  }

  return (
    <>
      <ul className="flex flex-col divide-y divide-border">
        {tasks.map((task) => (
          <li key={task.id} className="flex flex-col gap-1.5 py-3">
            {/* Title gets the full row width; status/assignee/hours sit on a
                second line so the card stays readable in a narrow column. */}
            <div className="flex items-start gap-2">
              <button
                type="button"
                onClick={() => openTask(task.id)}
                className="min-w-0 flex-1 text-left text-sm leading-snug hover:underline"
              >
                {task.title}
              </button>
              <div className="-my-1 flex shrink-0 items-center">
                <EditTaskDialog projectId={projectId} task={task} />
                <form action={deleteTaskAction.bind(null, task.id, projectId)}>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7"
                    type="submit"
                    aria-label="Delete task"
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </form>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <button
                type="button"
                onClick={() => cycleStatus(task)}
                disabled={isPending}
                className="shrink-0"
                title="Click to advance status"
              >
                <StatusBadge status={task.status} />
              </button>
              <LinearKeyBadge linearKey={task.linearKey} url={task.linearUrl} />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 gap-1.5 px-1.5 text-xs text-muted-foreground"
                    disabled={isPending}
                  >
                    <UserRound className="size-3.5" />
                    {task.assigneeName ?? "Unassigned"}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuItem
                    onSelect={() => startTransition(() => assignTaskAction(task.id, projectId, ""))}
                  >
                    Unassigned
                  </DropdownMenuItem>
                  {members.map((m) => (
                    <DropdownMenuItem
                      key={m.id}
                      onSelect={() =>
                        startTransition(() => assignTaskAction(task.id, projectId, m.id))
                      }
                    >
                      {m.name}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              {task.estimatedHours ? (
                <span className="tabular-figures ml-auto text-xs text-muted-foreground">
                  {task.actualHours.toFixed(2)} / {task.estimatedHours.toFixed(2)}h
                </span>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
      {sheet}
    </>
  );
}
