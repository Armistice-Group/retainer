import { CalendarClock } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/format";

const DAY_MS = 86_400_000;

/** Whole days from today (UTC, like the date-only due dates) to `due`. */
export function daysUntil(due: string, now = new Date()) {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((new Date(`${due.slice(0, 10)}T00:00:00Z`).getTime() - today) / DAY_MS);
}

/** "Due Jul 23", red once it's past (unless done), amber today/tomorrow. */
export function DueDateBadge({
  dueDate,
  done = false,
  className,
}: {
  /** YYYY-MM-DD */
  dueDate: string | null;
  done?: boolean;
  className?: string;
}) {
  if (!dueDate) return null;
  const days = daysUntil(dueDate);
  const label =
    done || days > 1 || days < -1
      ? `Due ${formatDate(dueDate)}`
      : days === 1
        ? "Due tomorrow"
        : days === 0
          ? "Due today"
          : "Due yesterday";
  return (
    <span
      // "Today" is worked out again in the browser; near midnight UTC the
      // two can differ by a day, which is fine.
      suppressHydrationWarning
      title={done ? undefined : days < 0 ? "Overdue" : undefined}
      className={cn(
        "inline-flex shrink-0 items-center gap-1 text-xs tabular-figures",
        done
          ? "text-muted-foreground"
          : days < 0
            ? "font-medium text-destructive"
            : days <= 1
              ? "font-medium text-amber-600 dark:text-amber-400"
              : "text-muted-foreground",
        className
      )}
    >
      <CalendarClock className="size-3" />
      {label}
    </span>
  );
}
