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

const STATUS_ORDER = ["TODO", "IN_PROGRESS", "DONE"] as const;

export type TaskItem = {
  id: string;
  title: string;
  status: string;
  assigneeId: string | null;
  assigneeName: string | null;
};

export function TaskList({
  projectId,
  tasks,
  members,
}: {
  projectId: string;
  tasks: TaskItem[];
  members: { id: string; name: string }[];
}) {
  const [isPending, startTransition] = useTransition();

  function cycleStatus(task: TaskItem) {
    const idx = STATUS_ORDER.indexOf(task.status as (typeof STATUS_ORDER)[number]);
    const next = STATUS_ORDER[(idx + 1) % STATUS_ORDER.length];
    startTransition(() => updateTaskStatusAction(task.id, projectId, next));
  }

  if (tasks.length === 0) {
    return <p className="text-sm text-muted-foreground">No tasks yet.</p>;
  }

  return (
    <ul className="flex flex-col divide-y divide-border">
      {tasks.map((task) => (
        <li key={task.id} className="flex items-center gap-3 py-2.5">
          <button
            type="button"
            onClick={() => cycleStatus(task)}
            disabled={isPending}
            className="shrink-0"
            title="Click to advance status"
          >
            <StatusBadge status={task.status} />
          </button>
          <span className="min-w-0 flex-1 truncate text-sm">{task.title}</span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-7 gap-1.5 px-2 text-xs" disabled={isPending}>
                <UserRound className="size-3.5" />
                {task.assigneeName ?? "Unassigned"}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onSelect={() => startTransition(() => assignTaskAction(task.id, projectId, ""))}
              >
                Unassigned
              </DropdownMenuItem>
              {members.map((m) => (
                <DropdownMenuItem
                  key={m.id}
                  onSelect={() => startTransition(() => assignTaskAction(task.id, projectId, m.id))}
                >
                  {m.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <form action={deleteTaskAction.bind(null, task.id, projectId)}>
            <Button variant="ghost" size="icon" className="size-7" type="submit">
              <Trash2 className="size-3.5" />
            </Button>
          </form>
        </li>
      ))}
    </ul>
  );
}
