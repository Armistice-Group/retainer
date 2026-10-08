import { addDays, addMonths } from "@/lib/date";

// Plain module (no server-only imports) — the option list is also used by
// client-side forms.
export const BILLING_INTERVALS = [
  { value: "WEEKLY", label: "Weekly" },
  { value: "BIWEEKLY", label: "Every 2 weeks" },
  { value: "SEMIMONTHLY", label: "Twice a month (1st & 15th)" },
  { value: "MONTHLY", label: "Monthly" },
  { value: "QUARTERLY", label: "Quarterly" },
  { value: "YEARLY", label: "Yearly" },
] as const;

export type BillingInterval = (typeof BILLING_INTERVALS)[number]["value"];

export const BILLING_INTERVAL_VALUES = BILLING_INTERVALS.map((i) => i.value) as [
  BillingInterval,
  ...BillingInterval[],
];

export function billingIntervalLabel(interval: BillingInterval) {
  return BILLING_INTERVALS.find((i) => i.value === interval)?.label ?? interval;
}

const MONTHS_PER: Partial<Record<BillingInterval, number>> = {
  MONTHLY: 1,
  QUARTERLY: 3,
  YEARLY: 12,
};

/** Semi-monthly cycles only ever run on the 1st or the 15th — moves a start
 * date forward to the next of those (or leaves it if it's already one). */
export function alignToInterval(date: Date, interval: BillingInterval) {
  if (interval !== "SEMIMONTHLY") return date;
  const d = new Date(date);
  if (d.getDate() === 1 || d.getDate() === 15) return d;
  if (d.getDate() < 15) d.setDate(15);
  else d.setMonth(d.getMonth() + 1, 1);
  return d;
}

/** The run after `date`. For month-based intervals, `anchorDay` (the day of
 * month the cycle started on) keeps clamped dates from drifting — a cycle
 * started on the 31st runs Jan 31 → Feb 28 → Mar 31, not Mar 28. */
export function nextRunDate(date: Date, interval: BillingInterval, anchorDay?: number) {
  switch (interval) {
    case "WEEKLY":
      return addDays(date, 7);
    case "BIWEEKLY":
      return addDays(date, 14);
    case "SEMIMONTHLY": {
      const d = new Date(date);
      if (d.getDate() < 15) d.setDate(15);
      else d.setMonth(d.getMonth() + 1, 1);
      return d;
    }
    default: {
      const d = addMonths(date, MONTHS_PER[interval] ?? 1);
      if (anchorDay) {
        const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
        d.setDate(Math.min(anchorDay, lastDay));
      }
      return d;
    }
  }
}
