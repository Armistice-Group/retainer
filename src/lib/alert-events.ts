// Org alerts and where each goes by default. Shared with the settings UI.
export const ALERT_EVENTS = {
  INVOICE_VIEWED: {
    label: "A client opens an invoice",
    hint: "The emailed invoice, its link, or its PDF — first open, then again after a day.",
    defaults: { email: true, slack: true },
  },
  BILLING_CHANGED: {
    label: "Billing or payment details change",
    hint: "Payment methods and instructions, billing contacts, terms, rates, billing cycles.",
    defaults: { email: true, slack: true },
  },
  INVOICE_SENT: {
    label: "An invoice is sent",
    hint: null,
    defaults: { email: true, slack: true },
  },
  INVOICE_PAID: {
    label: "An invoice is paid",
    hint: null,
    defaults: { email: true, slack: true },
  },
  INVOICE_OVERDUE: {
    label: "An invoice becomes overdue",
    hint: null,
    defaults: { email: false, slack: true },
  },
  BUDGET_ALERT: {
    label: "A project nears its budget or a task passes its estimate",
    hint: null,
    defaults: { email: false, slack: true },
  },
  TIMESHEET_SUBMITTED: {
    label: "A timesheet is submitted for approval",
    hint: null,
    defaults: { email: false, slack: false },
  },
} as const;

export type AlertEvent = keyof typeof ALERT_EVENTS;
export type AlertChannels = { email: boolean; slack: boolean };
export type AlertSettings = Partial<Record<AlertEvent, Partial<AlertChannels>>>;

export function channelsFor(settings: unknown, event: AlertEvent): AlertChannels {
  const saved =
    settings && typeof settings === "object"
      ? ((settings as AlertSettings)[event] ?? {})
      : {};
  const defaults = ALERT_EVENTS[event].defaults;
  return {
    email: typeof saved.email === "boolean" ? saved.email : defaults.email,
    slack: typeof saved.slack === "boolean" ? saved.slack : defaults.slack,
  };
}
