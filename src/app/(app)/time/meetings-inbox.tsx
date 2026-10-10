"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { CalendarDays, Check, Sparkles, Users, X } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState } from "@/components/empty-state";
import { ignoreMeetingAction, logMeetingAction } from "@/actions/calendar";
import { toISODate } from "@/lib/date";

export type Meeting = {
  id: string;
  uid: string;
  title: string;
  location: string | null;
  start: string;
  end: string;
  hours: number;
  attendees: string[];
  suggestedProjectId: string | null;
  suggestionReason: string | null;
};

const selectClass =
  "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2 text-sm sm:w-64";

const time = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
const day = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });

/** The viewer's calendar meetings waiting to be logged to a project or
 * ignored. Dates are the meeting's local day in this browser. */
export function MeetingsInbox({
  meetings,
  projects,
  hasFeeds,
}: {
  meetings: Meeting[];
  projects: { id: string; label: string }[];
  hasFeeds: boolean;
}) {
  const [done, setDone] = useState<Set<string>>(new Set());
  const [bulkPending, startBulk] = useTransition();
  const open = meetings.filter((m) => !done.has(m.id));
  const markDone = (ids: string[]) => setDone((prev) => new Set([...prev, ...ids]));

  if (!hasFeeds) {
    return (
      <EmptyState
        icon={CalendarDays}
        title="Connect your calendar"
        description="Add your calendar's iCal link on your profile and your meetings show up here to log against a project."
        action={
          <Button size="sm" asChild>
            <Link href="/profile#calendars">Connect a calendar</Link>
          </Button>
        }
      />
    );
  }
  if (open.length === 0) {
    return (
      <EmptyState
        icon={Check}
        title="All caught up"
        description="New meetings from your calendar show up here within the hour."
      />
    );
  }

  const suggested = open.filter((m) => m.suggestedProjectId && projects.some((p) => p.id === m.suggestedProjectId));
  const days = [...new Set(open.map((m) => toISODate(new Date(m.start))))];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {open.length} meeting{open.length === 1 ? "" : "s"} from the last two weeks to sort.
          Logging one adds its length as time on the project, dated the meeting&apos;s day.
        </p>
        {suggested.length > 1 ? (
          <Button
            size="sm"
            variant="outline"
            disabled={bulkPending}
            onClick={() =>
              startBulk(async () => {
                let ok = 0;
                for (const m of suggested) {
                  const r = await logMeetingAction(m.id, {
                    projectId: m.suggestedProjectId!,
                    billable: true,
                    date: toISODate(new Date(m.start)),
                    remember: false,
                  });
                  if (!r.error) {
                    ok++;
                    markDone([m.id]);
                  }
                }
                toast.success(`Logged ${ok} meeting${ok === 1 ? "" : "s"}.`);
              })
            }
          >
            <Sparkles /> Log all {suggested.length} suggested
          </Button>
        ) : null}
      </div>

      {days.map((d) => (
        <Card key={d} className="gap-0 p-0">
          <p className="border-b border-border px-4 py-2.5 text-sm font-medium">
            {day(open.find((m) => toISODate(new Date(m.start)) === d)!.start)}
          </p>
          <ul className="divide-y divide-border">
            {open
              .filter((m) => toISODate(new Date(m.start)) === d)
              .map((m) => (
                <MeetingRow
                  key={m.id}
                  meeting={m}
                  projects={projects}
                  seriesCount={open.filter((o) => o.uid === m.uid).length}
                  onDone={(ids) => markDone(ids)}
                />
              ))}
          </ul>
        </Card>
      ))}
    </div>
  );
}

function MeetingRow({
  meeting,
  projects,
  seriesCount,
  onDone,
}: {
  meeting: Meeting;
  projects: { id: string; label: string }[];
  seriesCount: number;
  onDone: (ids: string[]) => void;
}) {
  const suggestion = projects.some((p) => p.id === meeting.suggestedProjectId)
    ? meeting.suggestedProjectId!
    : "";
  const [projectId, setProjectId] = useState(suggestion);
  const [billable, setBillable] = useState(true);
  const [remember, setRemember] = useState(false);
  const [pending, startTransition] = useTransition();

  function log() {
    startTransition(async () => {
      const r = await logMeetingAction(meeting.id, {
        projectId,
        billable,
        date: toISODate(new Date(meeting.start)),
        remember,
      });
      if (r.error) {
        toast.error(r.error);
        return;
      }
      onDone([meeting.id]);
      if (r.alsoLogged) toast.success(`Also logged ${r.alsoLogged} more in this series.`);
    });
  }

  function ignore() {
    startTransition(async () => {
      const r = await ignoreMeetingAction(meeting.id, remember);
      if (r.error) toast.error(r.error);
      else onDone([meeting.id]);
    });
  }

  return (
    <li className="flex flex-col gap-2 px-4 py-3 text-sm lg:flex-row lg:items-center lg:gap-4">
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{meeting.title}</p>
        <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
          <span className="tabular-figures">
            {time(meeting.start)}–{time(meeting.end)} · {meeting.hours.toFixed(2)}h
          </span>
          {meeting.attendees.length ? (
            <span className="flex items-center gap-1" title={meeting.attendees.join(", ")}>
              <Users className="size-3" />
              {meeting.attendees.length}
            </span>
          ) : null}
          {meeting.suggestionReason && projectId === suggestion ? (
            <span className="flex items-center gap-1 text-brand">
              <Sparkles className="size-3" /> {meeting.suggestionReason}
            </span>
          ) : null}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          className={selectClass}
          aria-label={`Project for ${meeting.title}`}
        >
          <option value="">Choose a project…</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 text-xs">
          <Checkbox checked={billable} onCheckedChange={(v) => setBillable(v === true)} />
          Billable
        </label>
        <label
          className="flex items-center gap-1.5 text-xs"
          title="Sorts the other waiting meetings in this recurring series the same way now, and future ones automatically (billable or not, as ticked here). Undo with Forget them all on your profile."
        >
          <Checkbox checked={remember} onCheckedChange={(v) => setRemember(v === true)} />
          {seriesCount > 1 ? `Same for this series (${seriesCount})` : "Always for this series"}
        </label>
        <Button size="sm" disabled={pending || !projectId} onClick={log}>
          Log
        </Button>
        <Button size="sm" variant="ghost" disabled={pending} onClick={ignore} title="Not project work">
          <X /> Ignore
        </Button>
      </div>
    </li>
  );
}
