import { Plus } from "lucide-react";
import { requireOrgContext } from "@/lib/org-context";
import { phoneEntries, phoneTimeData } from "@/lib/services/phone";
import { TimeEntryDialog } from "@/app/(app)/time/time-entry-dialog";
import { EvidenceDialog } from "@/components/time-evidence";
import { Button } from "@/components/ui/button";
import { addDays, parseLocalDate, startOfWeek, toISODate } from "@/lib/date";
import { formatClockRange } from "@/lib/clock-time";
import { PhoneTimer } from "./phone-timer";
import { AttachButton } from "./attach-button";
import { InstallApp } from "./install-app";

const dayHeading = (iso: string, today: string) => {
  if (iso === today) return "Today";
  if (iso === toISODate(addDays(parseLocalDate(today), -1))) return "Yesterday";
  return new Intl.DateTimeFormat("en-US", { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" }).format(
    new Date(`${iso}T00:00:00Z`)
  );
};

export default async function PhoneTodayPage({ searchParams }: { searchParams: Promise<{ log?: string }> }) {
  const { org, user, role } = await requireOrgContext();
  const { log } = await searchParams;
  const viewer = { orgId: org.id, userId: user.id, role, clockRoundingMinutes: org.clockRoundingMinutes };

  const today = toISODate(new Date());
  const todayStart = parseLocalDate(today);
  const weekStart = startOfWeek(todayStart);
  // The last week of entries, so evidence can be added after the fact.
  const from = addDays(todayStart, -6) < weekStart ? addDays(todayStart, -6) : weekStart;
  const [data, entries] = await Promise.all([
    phoneTimeData(viewer),
    phoneEntries(viewer, from, addDays(todayStart, 1)),
  ]);

  const sum = (list: typeof entries) => list.reduce((total, e) => total + Number(e.hours), 0);
  const todayHours = sum(entries.filter((e) => toISODate(new Date(e.date)) === today));
  const weekHours = sum(entries.filter((e) => new Date(e.date) >= weekStart));
  const days = [...new Set(entries.map((e) => toISODate(new Date(e.date))))];

  return (
    <div className="flex flex-col gap-4">
      <InstallApp />

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-border bg-card p-3">
          <p className="text-xs text-muted-foreground">Today</p>
          <p className="tabular-figures text-2xl font-medium">{todayHours.toFixed(2)}h</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-3">
          <p className="text-xs text-muted-foreground">This week</p>
          <p className="tabular-figures text-2xl font-medium">{weekHours.toFixed(2)}h</p>
        </div>
      </div>

      <PhoneTimer
        timer={data.activeTimer}
        projects={data.projects}
        tasks={data.tasks}
        recentProjectIds={data.recentProjectIds}
      />

      {data.projects.length ? (
        <TimeEntryDialog
          {...data.dialog}
          defaultOpen={log === "1"}
          trigger={
            <Button variant="outline" className="h-12 text-base">
              <Plus className="size-4" /> Log time
            </Button>
          }
        />
      ) : null}

      {days.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">Nothing logged in the last week.</p>
      ) : (
        days.map((day) => {
          const dayEntries = entries.filter((e) => toISODate(new Date(e.date)) === day);
          return (
            <section key={day} aria-label={dayHeading(day, today)}>
              <h2 className="mb-2 flex items-baseline justify-between text-sm font-medium">
                {dayHeading(day, today)}
                <span className="tabular-figures text-muted-foreground">{sum(dayEntries).toFixed(2)}h</span>
              </h2>
              <ul className="divide-y divide-border rounded-xl border border-border bg-card">
                {dayEntries.map((entry) => {
                  const times = formatClockRange(entry.startMinute, entry.endMinute);
                  const label = `${entry.project.name}, ${Number(entry.hours)}h`;
                  return (
                    <li key={entry.id} className="flex items-center gap-2 p-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{entry.project.name}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {[entry.task?.title, entry.description].filter(Boolean).join(" · ") ||
                            entry.project.client.name}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="tabular-figures text-sm">{Number(entry.hours).toFixed(2)}h</p>
                        {times ? <p className="tabular-figures text-xs text-muted-foreground">{times}</p> : null}
                      </div>
                      {/* The paperclip shows what's attached; the camera adds more. */}
                      {entry.attachments.length ? (
                        <EvidenceDialog
                          entryId={entry.id}
                          title={label}
                          items={entry.attachments}
                          canEdit
                          clientSeesDetail={entry.project.client.invoiceTimeDetail}
                          clientId={entry.project.clientId}
                        />
                      ) : null}
                      <AttachButton entryId={entry.id} label={label} />
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })
      )}
    </div>
  );
}
