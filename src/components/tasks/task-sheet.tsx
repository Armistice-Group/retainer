"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import {
  ExternalLink,
  Eye,
  EyeOff,
  Loader2,
  MessageSquare,
  Play,
  Plus,
  Square,
  Trash2,
  Users,
} from "lucide-react";
import { CommentBody, MentionTextarea } from "@/components/tasks/mention-textarea";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SubmitButton } from "@/components/forms/submit-button";
import { EditTaskDialog } from "@/components/tasks/edit-task-dialog";
import { TimeEntryDialog } from "@/app/(app)/time/time-entry-dialog";
import {
  addTaskCommentAction,
  assignTaskAction,
  deleteTaskCommentAction,
  setCommentSharedAction,
  setTaskWatchingAction,
  updateTaskStatusAction,
} from "@/actions/tasks";
import { startTimerAction, stopTimerAction } from "@/actions/timer";
import { formatDate } from "@/lib/format";
import { toISODate } from "@/lib/date";
import type { TaskDetail } from "@/lib/task-detail";
import type { ActionState } from "@/actions/auth";

const STATUS_OPTIONS = [
  { value: "TODO", label: "To do" },
  { value: "IN_PROGRESS", label: "In progress" },
  { value: "DONE", label: "Done" },
] as const;

const UNASSIGNED = "__unassigned";

/** The task open in the sheet, kept in `?task=` so it can be linked to and
 * closed with the back button. Local state makes the sheet open on click
 * rather than after the server round trip that loads the task's details. */
export function useOpenTask() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const urlTaskId = searchParams.get("task");
  const [openTaskId, setOpenTaskId] = useState(urlTaskId);
  const [prevUrlTaskId, setPrevUrlTaskId] = useState(urlTaskId);
  if (urlTaskId !== prevUrlTaskId) {
    setPrevUrlTaskId(urlTaskId);
    setOpenTaskId(urlTaskId);
  }

  function navigate(taskId: string | null) {
    setOpenTaskId(taskId);
    const params = new URLSearchParams(searchParams.toString());
    if (taskId) params.set("task", taskId);
    else params.delete("task");
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  return {
    openTaskId,
    openTask: (taskId: string) => navigate(taskId),
    closeTask: () => navigate(null),
  };
}

export function TaskSheet({
  taskId,
  title,
  detail,
  showProject = false,
  onClose,
}: {
  taskId: string | null;
  /** Shown while the details load, so the header isn't blank. */
  title?: string;
  /** Server-loaded details; ignored unless they belong to `taskId`. */
  detail: TaskDetail | null;
  /** Link to the task's project — for views that span projects. */
  showProject?: boolean;
  onClose: () => void;
}) {
  const task = detail && detail.id === taskId ? detail : null;

  return (
    <Sheet open={!!taskId} onOpenChange={(open) => (open ? null : onClose())}>
      <SheetContent aria-describedby={undefined}>
        <SheetHeader>
          {task ? (
            <SheetDescription>
              {showProject ? (
                <Link href={`/projects/${task.project.id}`} className="hover:underline">
                  {task.project.clientName} — {task.project.name}
                </Link>
              ) : (
                `${task.project.clientName} — ${task.project.name}`
              )}
            </SheetDescription>
          ) : null}
          <div className="flex items-start gap-1">
            <SheetTitle className="min-w-0 flex-1">{task?.title ?? title ?? "Task"}</SheetTitle>
            {task ? <EditTaskDialog projectId={task.project.id} task={task} /> : null}
          </div>
        </SheetHeader>
        {task ? (
          <TaskSheetBody key={task.id} task={task} />
        ) : (
          <div className="flex flex-1 items-center justify-center text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function TaskSheetBody({ task }: { task: TaskDetail }) {
  const projectId = task.project.id;
  const [isPending, startTransition] = useTransition();
  const [timerError, setTimerError] = useState<string | null>(null);

  function stopTimer() {
    setTimerError(null);
    startTransition(async () => {
      const result = await stopTimerAction(toISODate(new Date()));
      if (result?.error) setTimerError(result.error);
    });
  }

  function startTimer() {
    setTimerError(null);
    startTransition(async () => {
      const result = await startTimerAction(
        projectId,
        task.id,
        null,
        true,
        toISODate(new Date())
      );
      if (result?.error) setTimerError(result.error);
    });
  }

  return (
    <>
      <div className="flex flex-1 flex-col gap-6 overflow-y-auto p-4">
        <dl className="grid grid-cols-[6rem_1fr] items-center gap-x-3 gap-y-2">
          <dt className="text-muted-foreground">Status</dt>
          <dd>
            <Select
              value={task.status}
              disabled={isPending}
              onValueChange={(value) =>
                startTransition(() => updateTaskStatusAction(task.id, projectId, value))
              }
            >
              <SelectTrigger size="sm" className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </dd>
          <dt className="text-muted-foreground">Assignee</dt>
          <dd>
            <Select
              value={task.assigneeId ?? UNASSIGNED}
              disabled={isPending}
              onValueChange={(value) =>
                startTransition(() =>
                  assignTaskAction(task.id, projectId, value === UNASSIGNED ? "" : value)
                )
              }
            >
              <SelectTrigger size="sm" className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
                {task.members.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </dd>
          <dt className="text-muted-foreground">Hours</dt>
          <dd className="tabular-figures">
            {task.actualHours.toFixed(2)}
            {task.estimatedHours ? ` / ${task.estimatedHours.toFixed(2)}` : ""}h
            {task.estimatedHours && task.actualHours > task.estimatedHours ? (
              <span className="ml-2 text-xs text-destructive">over estimate</span>
            ) : null}
          </dd>
          {task.linearUrl ? (
            <>
              <dt className="text-muted-foreground">Linear</dt>
              <dd>
                <a
                  href={task.linearUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 hover:underline"
                >
                  {task.linearKey ? (
                    <span className="font-mono text-xs">{task.linearKey}</span>
                  ) : (
                    "Open issue"
                  )}
                  <ExternalLink className="size-3" />
                </a>
              </dd>
            </>
          ) : null}
        </dl>

        {task.description ? (
          <section className="flex flex-col gap-2">
            <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Description
            </h3>
            <p className="leading-relaxed whitespace-pre-wrap">{task.description}</p>
          </section>
        ) : null}

        <section className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Time
            </h3>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={task.timerRunning ? stopTimer : startTimer}
                disabled={isPending}
              >
                {task.timerRunning ? (
                  <>
                    <Square className="size-3.5 fill-current" /> Stop timer
                  </>
                ) : (
                  <>
                    <Play className="size-3.5" /> Start timer
                  </>
                )}
              </Button>
              <TimeEntryDialog
                projects={[
                  { id: projectId, name: task.project.name, clientName: task.project.clientName },
                ]}
                tasks={[{ id: task.id, title: task.title, projectId }]}
                defaultProjectId={projectId}
                defaultTaskId={task.id}
                trigger={
                  <Button variant="outline" size="sm">
                    <Plus className="size-3.5" /> Log time
                  </Button>
                }
              />
            </div>
          </div>
          {timerError ? (
            <Alert variant="destructive">
              <AlertDescription>{timerError}</AlertDescription>
            </Alert>
          ) : null}
          {task.timeEntries.length === 0 ? (
            <p className="text-muted-foreground">No time logged on this task yet.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {task.timeEntries.map((entry) => (
                <li key={entry.id} className="flex items-start justify-between gap-3 py-2">
                  <div className="min-w-0">
                    <p>
                      {entry.userName}
                      <span className="text-muted-foreground"> · {formatDate(entry.date)}</span>
                      {entry.billable ? null : (
                        <Badge variant="outline" className="ml-2">
                          Non-billable
                        </Badge>
                      )}
                    </p>
                    {entry.description ? (
                      <p className="text-muted-foreground">{entry.description}</p>
                    ) : null}
                  </div>
                  <span className="tabular-figures shrink-0">{entry.hours.toFixed(2)}h</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Comments
            </h3>
            {task.assigneeId === task.viewerId ? (
              <span className="text-xs text-muted-foreground">Notified as assignee</span>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 gap-1 px-1.5 text-xs text-muted-foreground"
                disabled={isPending}
                onClick={() =>
                  startTransition(() =>
                    setTaskWatchingAction(task.id, projectId, !task.watching)
                  )
                }
                aria-pressed={task.watching}
                title={
                  task.watching
                    ? "You're notified of new comments. Click to stop."
                    : "Get notified of new comments"
                }
              >
                {task.watching ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                {task.watching ? "Unwatch" : "Watch"}
              </Button>
            )}
          </div>
          {task.comments.length === 0 ? (
            <p className="text-muted-foreground">
              No comments yet. Comments are internal — clients never see them.
            </p>
          ) : (
            <ul className="flex flex-col gap-4">
              {task.comments.map((comment) => (
                <li key={comment.id} className="group flex flex-col gap-1">
                  <div className="flex items-center gap-2 text-xs">
                    <span className="font-medium">{comment.authorName ?? "Former member"}</span>
                    <span className="text-muted-foreground">{timeAgo(comment.createdAt)}</span>
                    {comment.linearUrl ? (
                      <a
                        href={comment.linearUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-muted-foreground hover:underline"
                      >
                        {comment.fromLinear ? "From Linear" : "Posted to Linear"}{" "}
                        <ExternalLink className="size-3" />
                      </a>
                    ) : null}
                    {comment.sharedWithClient ? (
                      <Badge variant="outline" className="h-5 gap-1 px-1.5 text-[0.7rem] font-normal">
                        <Users className="size-3" /> Client can see
                      </Badge>
                    ) : null}
                    {comment.canDelete && (task.clientSharing || comment.sharedWithClient) ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="ml-auto h-6 px-1.5 text-xs text-muted-foreground opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                        disabled={isPending}
                        onClick={() =>
                          startTransition(() =>
                            setCommentSharedAction(comment.id, projectId, !comment.sharedWithClient)
                          )
                        }
                      >
                        {comment.sharedWithClient ? "Hide from client" : "Share with client"}
                      </Button>
                    ) : null}
                    {comment.canDelete ? (
                      <form
                        action={deleteTaskCommentAction.bind(null, comment.id, projectId)}
                        className="ml-auto opacity-0 group-hover:opacity-100 focus-within:opacity-100"
                      >
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-6"
                          type="submit"
                          aria-label="Delete comment"
                        >
                          <Trash2 className="size-3" />
                        </Button>
                      </form>
                    ) : null}
                  </div>
                  <p className="leading-relaxed whitespace-pre-wrap">
                    <CommentBody body={comment.body} viewerId={task.viewerId} />
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <CommentComposer task={task} />
    </>
  );
}

function CommentComposer({ task }: { task: TaskDetail }) {
  const action = addTaskCommentAction.bind(null, task.id, task.project.id);
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(action, null);
  const formRef = useRef<HTMLFormElement>(null);
  const wasPending = useRef(false);

  useEffect(() => {
    if (wasPending.current && !isPending && !state?.error && !state?.fieldErrors) {
      formRef.current?.reset();
    }
    wasPending.current = isPending;
  }, [isPending, state]);

  return (
    <form
      ref={formRef}
      action={formAction}
      className="flex flex-col gap-2 border-t border-border p-4"
    >
      {state?.error ? (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}
      <Label htmlFor="task-comment" className="sr-only">
        Comment
      </Label>
      <MentionTextarea
        people={task.mentionable}
        id="task-comment"
        name="body"
        rows={2}
        placeholder="Add a comment… (@ to mention)"
        required
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            formRef.current?.requestSubmit();
          }
        }}
      />
      {state?.fieldErrors?.body ? (
        <p className="text-sm text-destructive">{state.fieldErrors.body[0]}</p>
      ) : null}
      {task.clientSharing ? (
        <div className="flex items-center gap-2">
          <Checkbox id="task-comment-client" name="shareWithClient" />
          <Label htmlFor="task-comment-client" className="font-normal">
            Share with client (shown on the project&apos;s client link)
          </Label>
        </div>
      ) : null}
      <div className="flex items-center justify-between gap-2">
        {task.canPostToLinear ? (
          <div className="flex items-center gap-2">
            <Checkbox id="task-comment-linear" name="postToLinear" defaultChecked />
            <Label htmlFor="task-comment-linear" className="font-normal">
              Also post to Linear
            </Label>
          </div>
        ) : (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <MessageSquare className="size-3" /> Internal only
          </p>
        )}
        <SubmitButton size="sm" pendingText="Posting…">
          Comment
        </SubmitButton>
      </div>
    </form>
  );
}

function timeAgo(iso: string) {
  const seconds = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return formatDate(iso);
}
