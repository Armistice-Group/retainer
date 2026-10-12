// Wall-clock start/end times on time entries, stored as minutes after
// midnight (0–1439) relative to the entry's date. Shared by the server and
// the time entry dialog, so nothing here may import server-only code.

export const CLOCK_ROUNDING_OPTIONS = [1, 6, 15] as const;
export type ClockRounding = (typeof CLOCK_ROUNDING_OPTIONS)[number];

export const MINUTES_PER_DAY = 1440;

export const CLOCK_TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)(:[0-5]\d)?$/;

/** "09:30" → 570. Accepts "HH:MM" (and "HH:MM:SS", seconds dropped). */
export function parseClockTime(value: string): number | null {
  const match = CLOCK_TIME_PATTERN.exec(value.trim());
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

/** 570 → "09:30". */
export function formatClockTime(minute: number) {
  const h = Math.floor(minute / 60);
  const m = minute % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** "09:10–11:45"; null when the entry has no times. */
export function formatClockRange(start: number | null, end: number | null) {
  if (start == null || end == null) return null;
  return `${formatClockTime(start)}–${formatClockTime(end)}`;
}

/** Minutes worked from start to end; an end at or before the start is the next day. */
export function clockSpanMinutes(start: number, end: number) {
  return end > start ? end - start : end + MINUTES_PER_DAY - start;
}

export function endsNextDay(start: number, end: number) {
  return end <= start;
}

/**
 * Hours for a span, rounded to the nearest `rounding` minutes (1 = exact, to
 * the cent). Never rounds a real span down to zero: anything under one
 * increment counts as one.
 */
export function clockHours(spanMinutes: number, rounding: number) {
  const step = rounding > 0 ? rounding : 1;
  const minutes = Math.max(step, Math.round(spanMinutes / step) * step);
  return Math.round((minutes / 60) * 100) / 100;
}

/**
 * The most hours an entry with these times may claim: the span itself, or
 * the span rounded up to the org's increment, whichever is more.
 */
export function maxClockHours(start: number, end: number, rounding: number) {
  const span = clockSpanMinutes(start, end);
  return Math.max(Math.round((span / 60) * 100) / 100, clockHours(span, rounding));
}

export function clockRoundingLabel(rounding: number) {
  return rounding === 1 ? "Exact minute" : `${rounding} minutes`;
}

/** Normalizes a stored org setting to one of the offered options. */
export function toClockRounding(value: number | null | undefined): ClockRounding {
  return (CLOCK_ROUNDING_OPTIONS as readonly number[]).includes(value ?? -1)
    ? (value as ClockRounding)
    : 15;
}

/**
 * The calendar date ("2026-10-12") and minute of the day of an instant in an
 * IANA time zone. Falls back to UTC for an unknown zone.
 */
export function wallClockIn(instant: Date, timeZone: string | null | undefined) {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: timeZone || "UTC",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(instant);
  } catch {
    return wallClockIn(instant, "UTC");
  }
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    minute: (Number(get("hour")) % 24) * 60 + Number(get("minute")),
  };
}

export function isValidTimeZone(timeZone: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

/** An entry as the API and MCP show it: "HH:MM" start/end instead of minutes. */
export function withClockTimes<T extends { startMinute: number | null; endMinute: number | null }>(
  entry: T
) {
  const { startMinute, endMinute, ...rest } = entry;
  return {
    ...rest,
    startTime: startMinute == null ? null : formatClockTime(startMinute),
    endTime: endMinute == null ? null : formatClockTime(endMinute),
  };
}

/** The browser's IANA time zone (client components only). */
export function browserTimeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}
