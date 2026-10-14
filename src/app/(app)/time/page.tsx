import Link from "next/link";
import { ChevronLeft, ChevronRight, Clock, Download, Plus } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireOrgContext } from "@/lib/org-context";
import { projectVisibilityWhere } from "@/lib/project-access";
import { timeEntryWhere } from "@/lib/services/time-entries";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TimeEntryDialog } from "./time-entry-dialog";
import { PersonFilter } from "./person-filter";
import { TimesheetBar } from "./timesheet-bar";
import { TimesheetApprovals } from "./timesheet-approvals";
import { MeetingsInbox } from "./meetings-inbox";
import { meetingHours, pendingMeetings } from "@/lib/services/calendar";
import { SCHEDULING_PROVIDER_LABELS, type SchedulingProviderId } from "@/lib/integrations/scheduling/parse";
import {
  getTimesheet,
  modeCovers,
  pendingTimesheets,
  weekStartFromISO,
} from "@/lib/services/timesheets";
import { DeleteEntryButton } from "./delete-entry-button";
import {
  addDays,
  formatWeekLabel,
  parseLocalDate,
  startOfWeek,
  toISODate,
} from "@/lib/date";
import { cn } from "@/lib/utils";
import { formatClockRange, formatClockTime } from "@/lib/clock-time";
import { formatDate } from "@/lib/format";
import { EvidenceDialog } from "@/components/time-evidence";
import { attachmentSelect } from "@/lib/services/time-entry-attachments";

export default async function TimePage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string; view?: string; userId?: string; log?: string; project?: string }>;
}) {
  const { org, user, role, memberships } = await requireOrgContext();
  const { week, view, userId: filterUserId, log, project: logProjectId } = await searchParams;

  const canManageTeam = role === "OWNER" || role === "ADMIN";
  const teamView = canManageTeam && view === "team";
  const approvalsView = canManageTeam && view === "approvals";
  const meetingsView = view === "meetings";
  const membership = memberships.find((m) => m.orgId === org.id)!;
  const needsApproval = modeCovers(org.timesheetApproval, membership);

  const weekStart = startOfWeek(week ? parseLocalDate(week) : new Date());
  const weekEnd = addDays(weekStart, 7);

  const entryWhere = timeEntryWhere({
    orgId: org.id,
    actorId: user.id,
    role,
    teamView,
    weekStart,
    weekEnd,
    filterUserId,
  });

  const [projects, tasks, entries, teamMembers, pendingCount, sheet, feedCount, meetingCount] =
    await Promise.all([
    prisma.project.findMany({
      where: { orgId: org.id, ...projectVisibilityWhere(user.id, role) },
      include: { client: true },
      orderBy: [{ client: { name: "asc" } }, { name: "asc" }],
    }),
    prisma.task.findMany({
      where: { project: { orgId: org.id, ...projectVisibilityWhere(user.id, role) } },
      select: { id: true, title: true, projectId: true },
    }),
    prisma.timeEntry.findMany({
      where: entryWhere,
      include: {
        project: { include: { client: true } },
        user: true,
        task: { select: { title: true } },
        attachments: { select: attachmentSelect, orderBy: { createdAt: "asc" } },
      },
      orderBy: [{ date: "asc" }, { startMinute: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
    }),
    canManageTeam
      ? prisma.membership.findMany({
          where: { orgId: org.id },
          include: { user: true },
          orderBy: { user: { name: "asc" } },
        })
      : Promise.resolve([]),
    canManageTeam
      ? prisma.timesheet.count({ where: { orgId: org.id, status: "SUBMITTED" } })
      : Promise.resolve(0),
    needsApproval && !teamView
      ? getTimesheet(org.id, user.id, weekStartFromISO(toISODate(weekStart)))
      : Promise.resolve(null),
    prisma.calendarFeed.count({ where: { userId: user.id, orgId: org.id } }),
    prisma.calendarEvent.count({
      where: { userId: user.id, status: "PENDING", feed: { orgId: org.id } },
    }),
  ]);
  // New entries start on the project you last logged time to.
  const lastEntry = await prisma.timeEntry.findFirst({
    where: { orgId: org.id, userId: user.id },
    orderBy: { createdAt: "desc" },
    select: { projectId: true },
  });
  // Members can't change a week that's submitted or approved.
  const weekLocked =
    !canManageTeam && !!sheet && (sheet.status === "SUBMITTED" || sheet.status === "APPROVED");

  const projectOptions = projects.map((p) => ({
    id: p.id,
    name: p.name,
    clientName: p.client.name,
    requireClockTimes: p.client.requireClockTimes,
    invoiceTimeDetail: p.client.invoiceTimeDetail,
  }));
  const memberOptions = teamMembers.map((m) => ({ id: m.userId, name: m.user.name }));

  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const weekTotal = entries.reduce((sum, e) => sum + Number(e.hours), 0);

  const prevWeek = toISODate(addDays(weekStart, -7));
  const nextWeek = toISODate(addDays(weekStart, 7));
  const thisWeekStart = toISODate(startOfWeek(new Date()));
  const viewQuery = teamView ? "&view=team" : "";

  const today = toISODate(new Date());
  const viewingThisWeek = toISODate(weekStart) === thisWeekStart;
  const lockedNotice = weekLocked
    ? `Your timesheet for ${formatWeekLabel(weekStart)} is ${sheet?.status === "APPROVED" ? "approved" : "submitted"}, so time can't be added to that week. Pick a date in another week${sheet?.status === "SUBMITTED" ? ", or recall the timesheet first" : ""}.`
    : undefined;
  const dialogProps = {
    projects: projectOptions,
    tasks,
    canManageTeam,
    teamMembers: memberOptions,
    currentUserId: user.id,
    // ?project= (from a project page) wins over the last project you logged to.
    defaultProjectId: projectOptions.some((p) => p.id === logProjectId) ? logProjectId : lastEntry?.projectId,
    clockRounding: org.clockRoundingMinutes,
    notice: lockedNotice,
  };

  const logDialog = (
    <TimeEntryDialog
      {...dialogProps}
      defaultDate={viewingThisWeek ? today : toISODate(weekStart)}
      defaultOpen={log === "1"}
    />
  );

  return (
    <div>
      <PageHeader
        title="Time"
        description={teamView ? "Everyone's logged hours." : "Log hours against your projects."}
        actions={logDialog}
      />

      {/* Everyone gets My time and Meetings, so members can find the calendar inbox. */}
      <div className="mb-4 flex gap-1 overflow-x-auto border-b border-border">
        {[
          {
            href: "/time",
            label: "My time",
            active: !teamView && !approvalsView && !meetingsView,
            count: 0,
          },
          { href: "/time?view=meetings", label: "Meetings", active: meetingsView, count: meetingCount },
          ...(canManageTeam
            ? [{ href: "/time?view=team", label: "Team", active: teamView, count: 0 }]
            : []),
          ...(canManageTeam && (org.timesheetApproval !== "OFF" || pendingCount > 0)
            ? [
                {
                  href: "/time?view=approvals",
                  label: "Approvals",
                  active: approvalsView,
                  count: pendingCount,
                },
              ]
            : []),
        ].map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              "flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors",
              tab.active
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {tab.label}
            {tab.count > 0 ? (
              <Badge className="h-4 px-1.5 text-[0.65rem]">{tab.count}</Badge>
            ) : null}
          </Link>
        ))}
      </div>

      {meetingsView ? (
        <MeetingsInbox
          hasFeeds={feedCount > 0}
          projects={projects
            .filter((p) => p.status === "ACTIVE")
            .map((p) => ({ id: p.id, label: `${p.client.name} — ${p.name}` }))}
          meetings={(await pendingMeetings(user.id, org.id)).map((m) => ({
            id: m.id,
            uid: m.uid,
            title: m.title,
            location: m.location,
            start: m.start.toISOString(),
            end: m.end.toISOString(),
            hours: meetingHours(m),
            attendees: m.attendees,
            suggestedProjectId: m.suggestedProjectId,
            suggestionReason: m.suggestionReason,
            booking: m.booking
              ? {
                  source: SCHEDULING_PROVIDER_LABELS[m.booking.provider as SchedulingProviderId] ?? m.booking.provider,
                  clientId: m.booking.client?.id ?? null,
                  clientName: m.booking.client?.name ?? null,
                  draft: m.booking.client?.status === "LEAD",
                  billable: m.booking.eventType?.billable ?? true,
                }
              : null,
          }))}
        />
      ) : approvalsView ? (
        <TimesheetApprovals sheets={await pendingTimesheets(org.id)} />
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-1">
              <Button variant="outline" size="icon" className="size-8" asChild>
                <Link href={`/time?week=${prevWeek}${viewQuery}`} aria-label="Previous week" title="Previous week">
                  <ChevronLeft className="size-4" />
                </Link>
              </Button>
              <Button variant="outline" size="icon" className="size-8" asChild>
                <Link href={`/time?week=${nextWeek}${viewQuery}`} aria-label="Next week" title="Next week">
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
              {entries.length > 0 ? (
                <Button variant="outline" size="sm" asChild>
                  <a
                    href={`/api/time-entries/export?week=${toISODate(weekStart)}${viewQuery}${
                      filterUserId ? `&userId=${filterUserId}` : ""
                    }`}
                  >
                    <Download className="size-3.5" /> Export CSV
                  </a>
                </Button>
              ) : null}
            </div>
          </div>

          {needsApproval && !teamView ? (
            <TimesheetBar
              sheet={{
                week: toISODate(weekStart),
                status: sheet?.status ?? "DRAFT",
                note: sheet?.note ?? null,
                reviewerName: sheet?.reviewedBy?.name ?? null,
                hours: weekTotal,
              }}
            />
          ) : null}

          {entries.length === 0 ? (
            <EmptyState
              icon={Clock}
              title="No time logged this week"
              description="Use Log time above, or start the timer, as you work."
            />
          ) : (
            <div className="flex flex-col gap-4">
              {days.map((day) => {
                // An entry's date is a calendar date (stored at UTC midnight);
                // the week's days are local midnights.
                const dayKey = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
                const dayEntries = entries.filter((e) => toISODate(e.date) === dayKey);
                const dayTotal = dayEntries.reduce((sum, e) => sum + Number(e.hours), 0);
                const dayName = new Intl.DateTimeFormat("en-US", {
                  weekday: "long",
                  month: "short",
                  day: "numeric",
                }).format(day);

                return (
                  <Card key={day.toISOString()} className="gap-0 p-0">
                    <div
                      className={cn(
                        "flex items-center justify-between gap-2 px-4 py-2",
                        dayEntries.length > 0 && "border-b border-border"
                      )}
                    >
                      <span className={cn("text-sm font-medium", dayEntries.length === 0 && "text-muted-foreground")}>
                        {dayName}
                        {dayKey === today ? <span className="ml-2 text-xs text-brand">Today</span> : null}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="tabular-figures text-sm text-muted-foreground">
                          {dayEntries.length ? `${dayTotal.toFixed(2)}h` : ""}
                        </span>
                        {!teamView && !weekLocked ? (
                          <TimeEntryDialog
                            {...dialogProps}
                            defaultDate={dayKey}
                            trigger={
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-7"
                                aria-label={`Log time on ${dayName}`}
                                title={`Log time on ${dayName}`}
                              >
                                <Plus className="size-3.5" />
                              </Button>
                            }
                          />
                        ) : null}
                      </div>
                    </div>
                    {dayEntries.length ? (
                    <ul className="divide-y divide-border">
                      {dayEntries.map((entry) => {
                        const canEditThis =
                          teamView || (entry.userId === user.id && !weekLocked);
                        const range = formatClockRange(entry.startMinute, entry.endMinute);
                        const label = `${Number(entry.hours)}h on ${entry.project.name}`;
                        const details = [entry.task?.title, entry.description].filter(Boolean).join(" · ");
                        return (
                          <li
                            key={entry.id}
                            className="flex flex-col gap-1.5 px-4 py-3 sm:flex-row sm:items-center sm:gap-3"
                          >
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                <p className="min-w-0 max-w-full truncate text-sm font-medium">
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
                                {entry.approvedAt && org.timesheetApproval !== "OFF" ? (
                                  <Badge variant="outline" className="font-normal">
                                    Approved
                                  </Badge>
                                ) : null}
                                {entry.invoiceLineItemId ? (
                                  <Badge variant="outline" className="font-normal">
                                    Invoiced
                                  </Badge>
                                ) : null}
                              </div>
                              {details ? (
                                <p className="truncate text-sm text-muted-foreground">{details}</p>
                              ) : null}
                            </div>
                            <div className="flex items-center gap-3 self-end sm:self-auto">
                            {range ? (
                              <span className="tabular-figures text-sm text-muted-foreground">{range}</span>
                            ) : null}
                            <span className="tabular-figures text-sm">
                              {Number(entry.hours).toFixed(2)}h
                            </span>
                            <EvidenceDialog
                              entryId={entry.id}
                              title={[
                                `${entry.project.client.name} — ${entry.project.name}`,
                                formatDate(entry.date),
                                range,
                                entry.description,
                              ]
                                .filter(Boolean)
                                .join(" · ")}
                              items={entry.attachments}
                              canEdit={entry.userId === user.id || canManageTeam}
                              clientSeesDetail={entry.project.client.invoiceTimeDetail}
                              clientId={entry.project.clientId}
                            />
                            {!entry.invoiceLineItemId && canEditThis ? (
                              <div className="flex items-center gap-1">
                                <TimeEntryDialog
                                  {...dialogProps}
                                  notice={undefined}
                                  editValues={{
                                    id: entry.id,
                                    projectId: entry.projectId,
                                    taskId: entry.taskId ?? "",
                                    date: toISODate(new Date(entry.date)),
                                    hours: entry.hours.toString(),
                                    startTime:
                                      entry.startMinute != null ? formatClockTime(entry.startMinute) : "",
                                    endTime:
                                      entry.endMinute != null ? formatClockTime(entry.endMinute) : "",
                                    description: entry.description ?? "",
                                    billable: entry.billable,
                                    userId: entry.userId,
                                    rateOverride:
                                      entry.rateOverride != null ? entry.rateOverride.toString() : "",
                                  }}
                                />
                                <DeleteEntryButton entryId={entry.id} label={label} />
                              </div>
                            ) : null}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                    ) : null}
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
