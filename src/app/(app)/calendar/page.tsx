import Link from "next/link";
import { cookies } from "next/headers";
import { CalendarDays, ChevronLeft, ChevronRight, List } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireOrgContext } from "@/lib/org-context";
import { projectVisibilityWhere } from "@/lib/project-access";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/empty-state";
import { cn } from "@/lib/utils";
import {
  BILLING_TYPES,
  CALENDAR_TYPES,
  CALENDAR_TYPE_LABELS,
  dayIn,
  getCalendarItems,
  isValidTimeZone,
  type CalendarItem,
  type CalendarType,
} from "@/lib/services/calendar-items";
import { CALENDAR_STYLE } from "@/components/calendar/item-style";
import { TimeZoneCookie } from "@/components/calendar/time-zone-cookie";
import { CalendarFilters } from "./calendar-filters";

const DAY_MS = 86_400_000;
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const PER_CELL = 4;

type Params = {
  month?: string;
  view?: string;
  types?: string;
  client?: string;
  project?: string;
  tasks?: string;
};

const iso = (d: Date) => d.toISOString().slice(0, 10);

export default async function CalendarPage({ searchParams }: { searchParams: Promise<Params> }) {
  const { org, user, role } = await requireOrgContext();
  const params = await searchParams;
  const canManage = role === "OWNER" || role === "ADMIN";

  const rawTz = (await cookies()).get("tz")?.value ?? null;
  let cookieTz: string | null = null;
  try {
    cookieTz = rawTz ? decodeURIComponent(rawTz) : null;
  } catch {
    cookieTz = null;
  }
  const tz = isValidTimeZone(cookieTz) ? cookieTz : "UTC";
  const todayDay = dayIn(new Date(), tz);

  // The month shown: ?month=YYYY-MM, else this month.
  const monthParam = /^\d{4}-(0[1-9]|1[0-2])$/.test(params.month ?? "") ? params.month! : todayDay.slice(0, 7);
  const [year, month] = monthParam.split("-").map(Number);
  const monthStart = new Date(Date.UTC(year, month - 1, 1));
  const monthEnd = new Date(Date.UTC(year, month, 0));
  const shift = (n: number) => {
    const d = new Date(Date.UTC(year, month - 1 + n, 1));
    return iso(d).slice(0, 7);
  };
  const view = params.view === "agenda" ? "agenda" : "month";

  // Month grid: Monday of the first week through Sunday of the last.
  const gridStart = new Date(monthStart.getTime() - ((monthStart.getUTCDay() + 6) % 7) * DAY_MS);
  const gridEnd = new Date(monthEnd.getTime() + ((7 - monthEnd.getUTCDay()) % 7) * DAY_MS);

  const allowedTypes = CALENDAR_TYPES.filter((t) => canManage || !BILLING_TYPES.includes(t));
  const requested = (params.types ?? "")
    .split(",")
    .filter((t): t is CalendarType => (allowedTypes as string[]).includes(t));
  const activeTypes = requested.length ? requested : allowedTypes;
  const tasks = params.tasks === "all" ? "all" : "mine";

  const [items, projects] = await Promise.all([
    getCalendarItems(
      { orgId: org.id, userId: user.id, role },
      {
        from: iso(view === "month" ? gridStart : monthStart),
        to: iso(view === "month" ? gridEnd : monthEnd),
        types: activeTypes,
        clientId: params.client || null,
        projectId: params.project || null,
        tasks,
        timeZone: tz,
      }
    ),
    prisma.project.findMany({
      where: { orgId: org.id, status: { not: "ARCHIVED" }, ...projectVisibilityWhere(user.id, role) },
      select: { id: true, name: true, clientId: true, client: { select: { id: true, name: true } } },
      orderBy: [{ client: { name: "asc" } }, { name: "asc" }],
    }),
  ]);
  // Clients: the ones with a project you can see (owners and admins: all).
  const clients = canManage
    ? await prisma.client.findMany({
        where: { orgId: org.id },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      })
    : [...new Map(projects.map((p) => [p.client.id, p.client])).values()];

  const byDay = new Map<string, CalendarItem[]>();
  for (const item of items) {
    const list = byDay.get(item.day) ?? [];
    list.push(item);
    byDay.set(item.day, list);
  }

  const keep = new URLSearchParams();
  for (const key of ["types", "client", "project", "tasks"] as const) {
    if (params[key]) keep.set(key, params[key]!);
  }
  const href = (change: { month?: string; view?: string }) => {
    const q = new URLSearchParams(keep);
    const m = change.month ?? monthParam;
    const v = change.view ?? view;
    if (m !== todayDay.slice(0, 7)) q.set("month", m);
    if (v !== "month") q.set("view", v);
    const s = q.toString();
    return s ? `/calendar?${s}` : "/calendar";
  };
  const time = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: tz });
  const monthLabel = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(
    monthStart
  );

  const days: string[] = [];
  for (let d = gridStart.getTime(); d <= gridEnd.getTime(); d += DAY_MS) days.push(iso(new Date(d)));
  const agendaDays = [...byDay.keys()].filter((d) => d.startsWith(monthParam)).sort();

  return (
    <div>
      <TimeZoneCookie current={cookieTz} />
      <PageHeader
        title="Calendar"
        description="Your meetings and deadlines, and what's coming up across the projects you can see."
        actions={
          <div className="inline-flex rounded-md border border-border p-0.5">
            <Link
              href={href({ view: "month" })}
              aria-current={view === "month" ? "page" : undefined}
              className={cn(
                "inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-sm",
                view === "month" ? "bg-accent font-medium" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <CalendarDays className="size-3.5" /> Month
            </Link>
            <Link
              href={href({ view: "agenda" })}
              aria-current={view === "agenda" ? "page" : undefined}
              className={cn(
                "inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-sm",
                view === "agenda" ? "bg-accent font-medium" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <List className="size-3.5" /> Agenda
            </Link>
          </div>
        }
      />

      <div className="mb-4 flex flex-col gap-4">
        <CalendarFilters
          types={allowedTypes.map((type) => ({ type, label: CALENDAR_TYPE_LABELS[type] }))}
          activeTypes={activeTypes}
          clients={clients}
          projects={projects.map((p) => ({ id: p.id, name: p.name, clientId: p.clientId }))}
        />
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" className="size-8" asChild>
            <Link href={href({ month: shift(-1) })} aria-label="Previous month">
              <ChevronLeft className="size-4" />
            </Link>
          </Button>
          <Button variant="outline" size="icon" className="size-8" asChild>
            <Link href={href({ month: shift(1) })} aria-label="Next month">
              <ChevronRight className="size-4" />
            </Link>
          </Button>
          <h2 className="text-lg font-semibold">{monthLabel}</h2>
          {monthParam !== todayDay.slice(0, 7) ? (
            <Button variant="ghost" size="sm" asChild>
              <Link href={href({ month: todayDay.slice(0, 7) })}>Today</Link>
            </Button>
          ) : null}
        </div>
      </div>

      {view === "month" ? (
        <Card className="gap-0 overflow-hidden py-0">
          <div className="hidden grid-cols-7 border-b border-border bg-muted/40 text-xs font-medium text-muted-foreground sm:grid">
            {WEEKDAYS.map((d) => (
              <div key={d} className="px-2 py-1.5">
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-7">
            {days.map((day) => {
              const list = byDay.get(day) ?? [];
              const inMonth = day.startsWith(monthParam);
              // Phones get a list of days with something on them.
              const empty = list.length === 0;
              return (
                <div
                  key={day}
                  id={`d-${day}`}
                  className={cn(
                    "min-h-24 border-b border-border p-1.5 sm:border-r sm:[&:nth-child(7n)]:border-r-0",
                    !inMonth && "bg-muted/30",
                    empty && "hidden sm:block"
                  )}
                >
                  <div
                    className={cn(
                      "mb-1 flex items-center gap-1.5 text-xs tabular-figures",
                      inMonth ? "text-foreground" : "text-muted-foreground"
                    )}
                  >
                    <span
                      className={cn(
                        "inline-flex size-6 items-center justify-center rounded-full",
                        day === todayDay && "bg-brand font-semibold text-white"
                      )}
                    >
                      {Number(day.slice(8))}
                    </span>
                    <span className="sm:hidden">
                      {new Intl.DateTimeFormat("en-US", { weekday: "long", month: "short", timeZone: "UTC" }).format(
                        new Date(`${day}T00:00:00Z`)
                      )}
                    </span>
                  </div>
                  <ul className="flex flex-col gap-0.5">
                    {list.slice(0, PER_CELL).map((item) => (
                      <li key={item.key}>
                        <ItemLink item={item} time={item.start ? time.format(new Date(item.start)) : null} compact />
                      </li>
                    ))}
                  </ul>
                  {list.length > PER_CELL ? (
                    <Link
                      href={`${href({ view: "agenda" })}#d-${day}`}
                      className="mt-0.5 block px-1 text-xs text-muted-foreground hover:underline"
                    >
                      +{list.length - PER_CELL} more
                    </Link>
                  ) : null}
                </div>
              );
            })}
          </div>
        </Card>
      ) : agendaDays.length === 0 ? (
        <Card>
          <EmptyState
            icon={CalendarDays}
            title="Nothing this month"
            description="Due dates, meetings and invoice dates you can see show up here. Try another month or filter."
          />
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          {agendaDays.map((day) => (
            <Card key={day} id={`d-${day}`} className="gap-0 py-0">
              <div
                className={cn(
                  "border-b border-border px-4 py-2 text-sm font-medium",
                  day === todayDay && "text-brand"
                )}
              >
                {new Intl.DateTimeFormat("en-US", {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                  timeZone: "UTC",
                }).format(new Date(`${day}T00:00:00Z`))}
                {day === todayDay ? " · Today" : ""}
              </div>
              <ul className="flex flex-col divide-y divide-border">
                {byDay.get(day)!.map((item) => (
                  <li key={item.key} className="px-2 py-1.5">
                    <ItemLink item={item} time={item.start ? time.format(new Date(item.start)) : null} />
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      )}
      <p className="mt-4 text-xs text-muted-foreground">
        Times are in {tz === "UTC" ? "UTC" : tz.replace(/_/g, " ")}. Meetings are your own, from the
        calendars you connected under Profile. Want these deadlines in your own calendar app? See{" "}
        <Link href="/profile#calendar-subscription" className="text-brand hover:underline">
          Profile → Subscribe in your calendar app
        </Link>
        .
      </p>
    </div>
  );
}

const MEETING_STATUS: Record<string, string> = { PENDING: "To sort", LOGGED: "Logged", IGNORED: "Ignored" };

function ItemLink({ item, time, compact = false }: { item: CalendarItem; time: string | null; compact?: boolean }) {
  const { icon: Icon, className } = CALENDAR_STYLE[item.type];
  const status = item.meetingStatus
    ? MEETING_STATUS[item.meetingStatus]
    : item.overdue
      ? item.type === "scheduled_send"
        ? "Failed"
        : "Overdue"
      : item.done
        ? "Done"
        : null;
  return (
    <Link
      href={item.href}
      title={[time, item.title, item.detail, status].filter(Boolean).join(" · ")}
      className={cn(
        "flex min-w-0 items-center gap-1.5 rounded px-1 py-0.5 hover:bg-accent",
        compact ? "text-xs" : "text-sm"
      )}
    >
      <Icon className={cn("shrink-0", compact ? "size-3" : "size-4", className)} />
      {time ? <span className="shrink-0 tabular-figures text-muted-foreground">{time}</span> : null}
      <span
        className={cn(
          "min-w-0 truncate",
          item.done && "text-muted-foreground line-through decoration-muted-foreground/50",
          item.overdue && "font-medium text-destructive"
        )}
      >
        {item.title}
      </span>
      {!compact && item.detail ? (
        <span className="hidden min-w-0 truncate text-muted-foreground sm:inline">· {item.detail}</span>
      ) : null}
      {!compact && status ? (
        <span
          className={cn(
            "ml-auto shrink-0 rounded border border-border px-1.5 text-xs",
            item.overdue ? "text-destructive" : "text-muted-foreground"
          )}
        >
          {status}
        </span>
      ) : null}
    </Link>
  );
}
