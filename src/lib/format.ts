type Numeric = number | string | { toString(): string };

export function formatCurrency(amount: Numeric, currency: string = "USD") {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(
    Number(amount.toString())
  );
}

export function formatHours(hours: Numeric) {
  return `${Number(hours.toString()).toFixed(2)}h`;
}

// timeZone: "UTC" matters here — date-only DB columns come back as
// UTC-midnight Date objects, and formatting them in the server's local
// zone can roll the displayed calendar day back by one wherever the
// server runs west of UTC.
export function formatDate(date: Date | string) {
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(date));
}

export function toDateInputValue(date: Date | string) {
  const d = new Date(date);
  return d.toISOString().slice(0, 10);
}

export function websiteHref(website: string) {
  return /^https?:\/\//i.test(website) ? website : `https://${website}`;
}
