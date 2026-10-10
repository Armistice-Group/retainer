"use client";

import { useActionState, useState, useTransition } from "react";
import { CalendarDays, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/forms/submit-button";
import {
  addCalendarFeedAction,
  forgetSeriesRuleAction,
  removeCalendarFeedAction,
  syncCalendarFeedAction,
} from "@/actions/calendar";
import type { ActionState } from "@/actions/auth";
import { DocsLink } from "@/components/docs-link";

export type CalendarFeedItem = {
  id: string;
  name: string;
  lastSyncedAt: string | null;
  lastError: string | null;
};

export function CalendarsCard({
  feeds,
  rememberedCount,
}: {
  feeds: CalendarFeedItem[];
  rememberedCount: number;
}) {
  const [adding, setAdding] = useState(feeds.length === 0);
  const [pending, startTransition] = useTransition();
  const [state, formAction] = useActionState<ActionState, FormData>(async (prev, formData) => {
    const result = await addCalendarFeedAction(prev, formData);
    if (result?.saved) {
      setAdding(false);
      toast.success("Calendar connected — recent meetings are under Time → Meetings.");
    }
    return result;
  }, null);

  return (
    <Card id="calendars">
      <CardHeader>
        <CardTitle className="text-base">Calendars</CardTitle>
        <p className="text-xs text-muted-foreground">
          Connect a calendar and your finished meetings from the last two weeks show up under
          Time → Meetings to log against a project, with a suggestion for each. Synced every
          hour. Only you see them.
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {feeds.map((f) => (
          <div key={f.id} className="flex items-start gap-2 rounded-lg border border-border p-3 text-sm">
            <CalendarDays className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{f.name}</p>
              {f.lastError ? (
                <p className="text-xs text-destructive">{f.lastError}</p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  {f.lastSyncedAt
                    ? `Synced ${new Date(f.lastSyncedAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })} · every hour`
                    : "Not synced yet"}
                </p>
              )}
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              aria-label={`Sync ${f.name} now`}
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const r = await syncCalendarFeedAction(f.id);
                  if (r.error) toast.error(r.error);
                  else toast.success(r.added ? `${r.added} new meeting${r.added === 1 ? "" : "s"} to sort.` : "Up to date.");
                })
              }
            >
              <RefreshCw className="size-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              aria-label={`Remove ${f.name}`}
              disabled={pending}
              onClick={() => {
                if (confirm(`Disconnect "${f.name}"? Meetings you've already logged keep their time.`)) {
                  startTransition(() => removeCalendarFeedAction(f.id));
                }
              }}
            >
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        ))}

        {adding ? (
          <form action={formAction} className="flex flex-col gap-3 rounded-lg border border-border p-3">
            {state?.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cal-name">Name</Label>
              <Input id="cal-name" name="name" placeholder="Work calendar" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cal-url">Secret iCal link</Label>
              <Input id="cal-url" name="url" placeholder="https://calendar.google.com/calendar/ical/…/basic.ics" required />
              <details className="text-xs text-muted-foreground">
                <summary className="cursor-pointer">Where do I find it?</summary>
                <ul className="mt-1.5 flex list-disc flex-col gap-1 pl-4">
                  <li>
                    <strong>Google Calendar:</strong> gear icon → Settings → click your calendar under
                    Settings for my calendars → Integrate calendar → copy Secret address in iCal
                    format.
                  </li>
                  <li>
                    <strong>Outlook / Microsoft 365:</strong> gear icon → Calendar → Shared calendars →
                    Publish a calendar (Can view all details) → Publish → copy the ICS link.
                  </li>
                  <li>
                    <strong>Apple iCloud:</strong> in Calendar, Control-click the calendar → Share
                    Calendar → tick Public Calendar → copy the webcal:// link.
                  </li>
                  <li>
                    <strong>Fastmail:</strong> Settings → Calendars → open the calendar → share it as a
                    read-only .ics link.
                  </li>
                  <li>
                    <strong>Nextcloud:</strong> ⋯ next to the calendar → Share link → Copy
                    subscription link.
                  </li>
                </ul>
                <p className="mt-1.5">The link is stored encrypted. Anyone with it can read the calendar, so don&apos;t share it elsewhere.</p>
                <DocsLink page="integrations/calendars#connect-a-calendar" />
              </details>
            </div>
            <div className="flex gap-2">
              <SubmitButton size="sm" pendingText="Connecting...">
                Connect calendar
              </SubmitButton>
              {feeds.length ? (
                <Button type="button" variant="ghost" size="sm" onClick={() => setAdding(false)}>
                  Cancel
                </Button>
              ) : null}
            </div>
          </form>
        ) : (
          <Button variant="outline" size="sm" className="self-start" onClick={() => setAdding(true)}>
            Connect a calendar
          </Button>
        )}

        {rememberedCount > 0 ? (
          <p className="text-xs text-muted-foreground">
            {rememberedCount} recurring meeting{rememberedCount === 1 ? "" : "s"} sorted
            automatically.{" "}
            <button
              type="button"
              className="text-brand hover:underline"
              disabled={pending}
              onClick={() => startTransition(() => forgetSeriesRuleAction())}
            >
              Forget them all
            </button>
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
