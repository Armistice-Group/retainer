import Link from "next/link";
import { ListTodo } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireOrgContext } from "@/lib/org-context";
import { projectVisibilityWhere } from "@/lib/project-access";
import { getTaskDetail } from "@/lib/task-detail";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/empty-state";
import { Card } from "@/components/ui/card";
import { AddTaskDialog } from "@/components/tasks/add-task-dialog";
import { TasksBoard, type TaskGroup } from "./tasks-board";
import { cn } from "@/lib/utils";
import type { Prisma, TaskStatus } from "@/generated/prisma/client";

type Filters = { who: "mine" | "all"; status: "open" | "done" | "all" };

const STATUS_FILTER: Record<Filters["status"], TaskStatus[] | null> = {
  open: ["TODO", "IN_PROGRESS"],
  done: ["DONE"],
  all: null,
};

// In progress first — that's what you're most likely coming back to.
const STATUS_RANK: Record<string, number> = { IN_PROGRESS: 0, TODO: 1, DONE: 2 };

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<{ who?: string; status?: string; task?: string }>;
}) {
  const { org, user, role } = await requireOrgContext();
  const params = await searchParams;
  const filters: Filters = {
    who: params.who === "all" ? "all" : "mine",
    status: params.status === "done" || params.status === "all" ? params.status : "open",
  };

  const visibleProjects = { orgId: org.id, ...projectVisibilityWhere(user.id, role) };
  const statuses = STATUS_FILTER[filters.status];
  const where: Prisma.TaskWhereInput = {
    project: visibleProjects,
    ...(filters.who === "mine" ? { assigneeId: user.id } : {}),
    ...(statuses ? { status: { in: statuses } } : {}),
  };

  const [tasks, projects, openTaskDetail, activeTimer] = await Promise.all([
    prisma.task.findMany({
      where,
      include: {
        assignee: { select: { name: true } },
        project: { select: { id: true, name: true, client: { select: { name: true } } } },
        externalLink: { select: { source: true, externalKey: true } },
        _count: { select: { comments: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.project.findMany({
      where: { ...visibleProjects, status: "ACTIVE" },
      include: {
        client: { select: { name: true } },
        members: { include: { user: { select: { id: true, name: true } } } },
      },
      orderBy: [{ client: { name: "asc" } }, { name: "asc" }],
    }),
    params.task ? getTaskDetail(params.task, { orgId: org.id, userId: user.id, role }) : null,
    prisma.activeTimer.findUnique({ where: { userId: user.id }, select: { taskId: true } }),
  ]);

  const hours = tasks.length
    ? await prisma.timeEntry.groupBy({
        by: ["taskId"],
        where: { taskId: { in: tasks.map((t) => t.id) } },
        _sum: { hours: true },
      })
    : [];
  const hoursByTask = new Map(hours.map((h) => [h.taskId as string, Number(h._sum.hours ?? 0)]));

  const groupMap = new Map<string, TaskGroup>();
  for (const t of tasks) {
    let group = groupMap.get(t.project.id);
    if (!group) {
      group = {
        projectId: t.project.id,
        projectName: t.project.name,
        clientName: t.project.client.name,
        tasks: [],
      };
      groupMap.set(t.project.id, group);
    }
    group.tasks.push({
      id: t.id,
      title: t.title,
      status: t.status,
      assigneeName: t.assignee?.name ?? null,
      estimatedHours: t.estimatedHours ? Number(t.estimatedHours) : null,
      actualHours: hoursByTask.get(t.id) ?? 0,
      commentCount: t._count.comments,
      linearKey: t.externalLink?.source === "linear" ? t.externalLink.externalKey : null,
    });
  }
  const groups = [...groupMap.values()].sort(
    (a, b) =>
      a.clientName.localeCompare(b.clientName) || a.projectName.localeCompare(b.projectName)
  );
  for (const g of groups) {
    g.tasks.sort((a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status]);
  }

  // Tasks can only be assigned to project members, so projects without any
  // can't take one yet.
  const addTaskProjects = projects
    .filter((p) => p.members.length > 0)
    .map((p) => ({
      id: p.id,
      label: `${p.client.name} — ${p.name}`,
      members: p.members.map((m) => ({ id: m.user.id, name: m.user.name })),
    }));

  const href = (change: Partial<Filters>) => {
    const next = { ...filters, ...change };
    const query = new URLSearchParams();
    if (next.who !== "mine") query.set("who", next.who);
    if (next.status !== "open") query.set("status", next.status);
    const qs = query.toString();
    return qs ? `/tasks?${qs}` : "/tasks";
  };

  return (
    <div>
      <PageHeader
        title="Tasks"
        description={
          filters.who === "mine" ? "Assigned to you, across every project." : "Everyone's tasks."
        }
        actions={
          addTaskProjects.length > 0 ? (
            <AddTaskDialog projects={addTaskProjects} triggerLabel="New task" />
          ) : null
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <FilterGroup
          options={[
            { label: "Mine", href: href({ who: "mine" }), active: filters.who === "mine" },
            { label: "Everyone", href: href({ who: "all" }), active: filters.who === "all" },
          ]}
        />
        <FilterGroup
          options={[
            { label: "Open", href: href({ status: "open" }), active: filters.status === "open" },
            { label: "Done", href: href({ status: "done" }), active: filters.status === "done" },
            { label: "All", href: href({ status: "all" }), active: filters.status === "all" },
          ]}
        />
      </div>

      {groups.length === 0 ? (
        <Card>
          <EmptyState
            icon={ListTodo}
            title={
              filters.status === "done"
                ? "Nothing finished yet"
                : filters.who === "mine"
                  ? "Nothing assigned to you"
                  : "No tasks"
            }
            description={
              filters.who === "mine" && filters.status === "open"
                ? "Tasks assigned to you on any project show up here."
                : "Try a different filter."
            }
          />
        </Card>
      ) : null}

      <TasksBoard
        groups={groups}
        openTaskDetail={openTaskDetail}
        runningTaskId={activeTimer?.taskId ?? null}
      />
    </div>
  );
}

function FilterGroup({
  options,
}: {
  options: { label: string; href: string; active: boolean }[];
}) {
  return (
    <div className="inline-flex rounded-md border border-border p-0.5">
      {options.map((o) => (
        <Link
          key={o.label}
          href={o.href}
          aria-current={o.active ? "page" : undefined}
          className={cn(
            "rounded px-2.5 py-1 text-sm transition-colors",
            o.active
              ? "bg-accent font-medium text-accent-foreground"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {o.label}
        </Link>
      ))}
    </div>
  );
}
