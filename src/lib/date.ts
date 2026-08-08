// `new Date("2026-08-03")` parses as UTC midnight, which rolls back to the
// previous local calendar day on any server west of UTC — this constructs
// local midnight instead, so a "YYYY-MM-DD" string round-trips correctly.
export function parseLocalDate(dateStr: string) {
  return new Date(`${dateStr}T00:00:00`);
}

export function startOfWeek(date: Date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = (day === 0 ? -6 : 1) - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function addDays(date: Date, days: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

// Clamps to the last day of the target month instead of overflowing (JS's
// default setMonth behavior) — Jan 31 + 1 month lands on Feb 28/29, not Mar 3.
export function addMonths(date: Date, months: number) {
  const d = new Date(date);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + months);
  const lastDayOfTargetMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, lastDayOfTargetMonth));
  return d;
}

export function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function toISODate(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function formatWeekLabel(weekStart: Date) {
  const weekEnd = addDays(weekStart, 6);
  const sameMonth = weekStart.getMonth() === weekEnd.getMonth();
  const startFmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(
    weekStart
  );
  // Intl.DateTimeFormat has no sane skeleton for "day + year" without a
  // month — it falls back to a garbled "2026 (day: 9)" string — so the
  // same-month case is built by hand instead of omitting `month`.
  const endFmt = sameMonth
    ? `${weekEnd.getDate()}, ${weekEnd.getFullYear()}`
    : new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(
        weekEnd
      );
  return `${startFmt} – ${endFmt}`;
}
