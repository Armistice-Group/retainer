"use client";

/** A moment shown in the viewer's own time zone ("Jul 23, 2026, 9:00 AM").
 * The server renders it in UTC first; the browser corrects it. */
export function LocalDateTime({ iso, dateOnly = false }: { iso: string; dateOnly?: boolean }) {
  const d = new Date(iso);
  const text = d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    ...(dateOnly ? {} : { hour: "numeric", minute: "2-digit" }),
  });
  return (
    <time dateTime={iso} suppressHydrationWarning>
      {text}
    </time>
  );
}
