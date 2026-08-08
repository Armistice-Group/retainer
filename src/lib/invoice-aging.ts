// dueDate is a date-only column (@db.Date), stored as UTC midnight — comparing
// against a plain `new Date()` (server-local time) would reintroduce the same
// off-by-one bug already fixed elsewhere in this app (parseLocalDate,
// formatDate's explicit timeZone: "UTC"). Normalize "today" to UTC midnight
// too so the comparison is timezone-safe regardless of server location.
function utcMidnight(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

// An invoice due today isn't overdue yet — only strictly past its due date.
export function isOverdue(status: string, dueDate: Date, now = new Date()) {
  return status === "SENT" && dueDate.getTime() < utcMidnight(now).getTime();
}

export function daysOverdue(dueDate: Date, now = new Date()) {
  const diffMs = utcMidnight(now).getTime() - utcMidnight(dueDate).getTime();
  return Math.max(0, Math.round(diffMs / 86_400_000));
}
