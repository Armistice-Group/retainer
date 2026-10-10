/** "Expires Oct 30, 2026" / "Expired Oct 1, 2026" / "Never expires". */
export function shareExpiryLabel(expiresAt: Date | null, now: Date) {
  if (!expiresAt) return "Never expires";
  const day = new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(expiresAt);
  return expiresAt.getTime() <= now.getTime() ? `Expired ${day}. Regenerate to send a new link.` : `Expires ${day}`;
}
