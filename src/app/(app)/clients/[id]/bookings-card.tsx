import { CalendarCheck, ExternalLink } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  SCHEDULING_PROVIDER_LABELS,
  type Answer,
  type SchedulingProviderId,
} from "@/lib/integrations/scheduling/parse";
import type { clientBookings } from "@/lib/services/scheduling";

type Bookings = Awaited<ReturnType<typeof clientBookings>>;
type Row = Bookings["upcoming"][number];

const STATUS: Record<string, string | null> = {
  SCHEDULED: null,
  CANCELLED: "Cancelled",
  RESCHEDULED: "Moved",
  NO_SHOW: "No-show",
};

const when = (d: Date) =>
  d.toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  });

function BookingRow({ b, showAnswers }: { b: Row; showAnswers: boolean }) {
  const answers = (Array.isArray(b.answers) ? b.answers : []) as Answer[];
  const status = STATUS[b.status];
  return (
    <li className="flex flex-col gap-1 py-2.5 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium">{b.title}</span>
        <span className="flex items-center gap-2">
          {status ? (
            <Badge variant="outline" className="font-normal">
              {status}
            </Badge>
          ) : null}
          {b.joinUrl && b.status === "SCHEDULED" ? (
            <a
              href={b.joinUrl}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1 text-xs text-brand hover:underline"
            >
              Join <ExternalLink className="size-3" />
            </a>
          ) : null}
        </span>
      </div>
      <p className="text-xs text-muted-foreground">
        {when(b.startAt)} UTC · {SCHEDULING_PROVIDER_LABELS[b.provider as SchedulingProviderId] ?? b.provider}
        {b.contact?.name || b.inviteeName ? ` · ${b.contact?.name ?? b.inviteeName}` : ""}
        {b.hostUser?.name ? ` · with ${b.hostUser.name}` : ""}
      </p>
      {showAnswers && answers.length ? (
        <dl className="mt-1 grid gap-x-3 gap-y-0.5 text-xs sm:grid-cols-[auto_1fr]">
          {answers.map((a, i) => (
            <div key={i} className="contents">
              <dt className="text-muted-foreground">{a.question}</dt>
              <dd className="whitespace-pre-wrap break-words">{a.answer}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </li>
  );
}

/** Cal.com/Calendly bookings for this client. */
export function BookingsCard({ bookings }: { bookings: Bookings }) {
  if (bookings.upcoming.length === 0 && bookings.past.length === 0) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarCheck className="size-4 text-muted-foreground" /> Bookings
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {bookings.upcoming.length ? (
          <div>
            <p className="text-xs font-medium text-muted-foreground">Upcoming</p>
            <ul className="flex flex-col divide-y divide-border">
              {bookings.upcoming.map((b) => (
                <BookingRow key={b.id} b={b} showAnswers />
              ))}
            </ul>
          </div>
        ) : null}
        {bookings.past.length ? (
          <details open={bookings.upcoming.length === 0}>
            <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
              Earlier ({bookings.past.length})
            </summary>
            <ul className="flex flex-col divide-y divide-border">
              {bookings.past.map((b) => (
                <BookingRow key={b.id} b={b} showAnswers={false} />
              ))}
            </ul>
          </details>
        ) : null}
      </CardContent>
    </Card>
  );
}
