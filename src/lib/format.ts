type Numeric = number | string | { toString(): string };

export function formatCurrency(amount: Numeric, currency: string = "USD") {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(
    Number(amount.toString())
  );
}

export function formatHours(hours: Numeric) {
  return `${Number(hours.toString()).toFixed(2)}h`;
}

export function formatDate(date: Date | string) {
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(date));
}

export function toDateInputValue(date: Date | string) {
  const d = new Date(date);
  return d.toISOString().slice(0, 10);
}
