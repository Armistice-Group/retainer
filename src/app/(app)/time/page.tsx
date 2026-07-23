import Link from "next/link";
import { ChevronLeft, ChevronRight, Clock, Trash2 } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireOrgContext } from "@/lib/org-context";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TimeEntryDialog } from "./time-entry-dialog";
import { PersonFilter } from "./person-filter";
import { deleteTimeEntryAction } from "@/actions/time-entries";
import { addDays, formatWeekLabel, isSameDay, startOfWeek, toISODate } from "@/lib/date";
import { cn } from "@/lib/utils";

export default async function TimePage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string; view?: string; userId?: string }>;
}) {
  const { org, user, role } = await requireOrgContext();
  const { week, view, userId: filterUserId } = await searchParams;

  const canManageTeam = role === "OWNER" || role === "ADMIN";
  const teamView = canManageTeam && view === "team";

  const weekStart = startOfWeek(week ? new Date(week) : new Date());
  const weekEnd = addDays(weekStart, 7);

  const entryWhere = teamView
    ? {
        orgId: org.id,
        date: { gte: weekStart, lt: weekEnd },
        ...(filterUserId ? { userId: filterUserId } : {}),
      }
    : { orgId: org.id, userId: user.id, date: { gte: weekStart, lt: weekEnd } };

  const [projects, tasks, entries, teamMembers] = await Promise.all([
    prisma.project.findMany({
      where: { orgId: org.id },
      include: { client: true },
      orderBy: [{ client: { name: "asc" } }, { name: "asc" }],
    }),
    prisma.task.findMany({
      where: { project: { orgId: org.id } },
      select: { id: true, title: true, projectId: true },
    }),
    prisma.timeEntry.findMany({
      where: entryWhere,
      include: { project: { include: { client: true } }, user: true },
      orderBy: { date: "asc" },
    }),
    canManageTeam
      ? prisma.membership.findMany({
          where: { orgId: org.id },
          include: { user: true },
          orderBy: { user: { name: "asc" } },
        })
      : Promise.resolve([]),
  ]);

  const projectOptions = projects.map((p) => ({
    id: p.id,
    name: p.name,
    clientName: p.client.name,
  }));
  const memberOptions = teamMembers.map((m) => ({ id: m.userId, name: m.user.name }));

  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const weekTotal = entries.reduce((sum, e) => sum + Number(e.hours), 0);

  const prevWeek = toISODate(addDays(weekStart, -7));
  const nextWeek = toISODate(addDays(weekStart, 7));
  const thisWeekStart = toISODate(startOfWeek(new Date()));
  const viewQuery = teamView ? "&view=team" : "";

  const logDialog = (
    <TimeEntryDialog
      projects={projectOptions}
      tasks={tasks}
      canManageTeam={teamView}
      teamMembers={memberOptions}
    />
  );

  return (
    <div>
      <PageHeader
        title="Time"
        description={teamView ? "Everyone's logged hours." : "Log hours against your projects."}
        actions={logDialog}
      />

      {canManageTeam ? (
        <div className="mb-4 flex gap-1 border-b border-border">
          <Link
            href="/time"
            className={cn(
              "border-b-2 px-3 py-2 text-sm font-medium transition-colors",
              !teamView
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            My time
          </Link>
          <Link
            href="/time?view=team"
            className={cn(
              "border-b-2 px-3 py-2 text-sm font-medium transition-colors",
              teamView
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            Team
          </Link>
        </div>
      ) : null}

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" className="size-8" asChild>
            <Link href={`/time?week=${prevWeek}${viewQuery}`}>
              <ChevronLeft className="size-4" />
            </Link>
          </Button>
          <Button variant="outline" size="icon" className="size-8" asChild>
            <Link href={`/time?week=${nextWeek}${viewQuery}`}>
              <ChevronRight className="size-4" />
            </Link>
          </Button>
          <span className="ml-2 text-sm font-medium">{formatWeekLabel(weekStart)}</span>
          {toISODate(weekStart) !== thisWeekStart ? (
            <Button variant="ghost" size="sm" asChild>
              <Link href={teamView ? "/time?view=team" : "/time"}>This week</Link>
            </Button>
          ) : null}
        </div>
        <div className="flex items-center gap-3">
          {teamView ? <PersonFilter members={memberOptions} /> : null}
          <span className="tabular-figures text-sm text-muted-foreground">
            {weekTotal.toFixed(2)}h logged
          </span>
        </div>
      </div>

      {entries.length === 0 ? (
        <EmptyState
          icon={Clock}
          title="No time logged this week"
          description="Log hours as you go so invoicing stays effortless."
          action={logDialog}
        />
      ) : (
        <div className="flex flex-col gap-4">
          {days.map((day) => {
            const dayEntries = entries.filter((e) => isSameDay(new Date(e.date), day));
            if (dayEntries.length === 0) return null;
            const dayTotal = dayEntries.reduce((sum, e) => sum + Number(e.hours), 0);

            return (
              <Card key={day.toISOString()} className="p-0">
                <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
                  <span className="text-sm font-medium">
                    {new Intl.DateTimeFormat("en-US", {
                      weekday: "long",
                      month: "short",
                      day: "numeric",
                    }).format(day)}
                  </span>
                  <span className="tabular-figures text-sm text-muted-foreground">
                    {dayTotal.toFixed(2)}h
                  </span>
                </div>
                <ul className="divide-y divide-border">
                  {dayEntries.map((entry) => {
                    const canEditThis = teamView || entry.userId === user.id;
                    return (
                      <li key={entry.id} className="flex items-center gap-3 px-4 py-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="truncate text-sm font-medium">
                              {entry.project.client.name} — {entry.project.name}
                            </p>
                            {teamView ? (
                              <Badge variant="outline" className="font-normal">
                                {entry.user.name}
                              </Badge>
                            ) : null}
                            {!entry.billable ? (
                              <Badge variant="outline" className="font-normal">
                                Non-billable
                              </Badge>
                            ) : null}
                            {entry.rateOverride != null ? (
                              <Badge variant="outline" className="font-normal">
                                Rate override
                              </Badge>
                            ) : null}
                            {entry.invoiceLineItemId ? (
                              <Badge variant="outline" className="font-normal">
                                Invoiced
                              </Badge>
                            ) : null}
                          </div>
                          {entry.description ? (
                            <p className="truncate text-sm text-muted-foreground">
                              {entry.description}
                            </p>
                          ) : null}
                        </div>
                        <span className="tabular-figures text-sm">
                          {Number(entry.hours).toFixed(2)}h
                        </span>
                        {!entry.invoiceLineItemId && canEditThis ? (
                          <div className="flex items-center gap-1">
                            <TimeEntryDialog
                              projects={projectOptions}
                              tasks={tasks}
                              canManageTeam={teamView}
                              teamMembers={memberOptions}
                              editValues={{
                                id: entry.id,
                                projectId: entry.projectId,
                                taskId: entry.taskId ?? "",
                                date: toISODate(new Date(entry.date)),
                                hours: entry.hours.toString(),
                                description: entry.description ?? "",
                                billable: entry.billable,
                                userId: entry.userId,
                                rateOverride:
                                  entry.rateOverride != null ? entry.rateOverride.toString() : "",
                              }}
                            />
                            <form action={deleteTimeEntryAction.bind(null, entry.id)}>
                              <Button variant="ghost" size="icon" className="size-7" type="submit">
                                <Trash2 className="size-3.5" />
                              </Button>
                            </form>
                          </div>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
