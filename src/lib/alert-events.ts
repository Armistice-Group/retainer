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
  SECURITY_ALERT: {
    label: "Access or security settings change",
    hint: "Roles, members removed, invites, API keys, SSO, sign-in rules, two-factor turned off or required, password resets, many deletions at once.",
    defaults: { email: true, slack: true },
  },
  INVOICE_SENT: {
    label: "An invoice is sent",
    hint: null,
    defaults: { email: true, slack: true },
  },
  INVOICE_PAID: {
    label: "An invoice is paid",
    hint: "Paid in full: by hand, online, through a bank sync, or with credit.",
    defaults: { email: true, slack: true },
  },
  PAYMENT_RECEIVED: {
    label: "A part payment is received",
    hint: "Money toward an invoice that still has a balance due.",
    defaults: { email: false, slack: true },
  },
  PAYMENT_FAILED: {
    label: "An online payment fails",
    hint: "A bank (ACH) payment made through \"Pay now\" bounced after it was submitted.",
    defaults: { email: true, slack: true },
  },
  INVOICE_OVERDUE: {
    label: "An invoice becomes overdue",
    hint: null,
    defaults: { email: false, slack: true },
  },
  ESTIMATE_ACCEPTED: {
    label: "A client accepts an estimate",
    hint: "On the estimate's client page, or marked accepted by hand.",
    defaults: { email: true, slack: true },
  },
  ESTIMATE_DECLINED: {
    label: "A client declines an estimate",
    hint: null,
    defaults: { email: true, slack: true },
  },
  BUDGET_ALERT: {
    label: "A project nears its budget or a task passes its estimate",
    hint: null,
    defaults: { email: false, slack: true },
  },
  WEEKLY_DIGEST: {
    label: "Weekly digest (Mondays)",
    hint: "Last week's hours, invoicing and payments, overdue invoices, projects near budget.",
    defaults: { email: true, slack: false },
  },
  TIMESHEET_SUBMITTED: {
    label: "A timesheet is submitted for approval",
    hint: null,
    defaults: { email: false, slack: false },
  },
  EXPENSE_SUBMITTED: {
    label: "An expense is waiting for approval",
    hint: "A member logs an expense over the approval threshold. On a confidential project, Slack and email leave out the project and description.",
    defaults: { email: true, slack: true },
  },
  TIME_LOGGED: {
    label: "Someone logs time",
    hint: "Not sent when the only owner or admin logs their own time.",
    defaults: { email: false, slack: true },
  },
  RECURRING_INVOICE_GENERATED: {
    label: "A recurring invoice or billing cycle needs review",
    hint: "Drafts waiting for review, and invoices set to send automatically that couldn't be emailed (they're still marked sent). Ones emailed automatically use \"An invoice is sent\" instead.",
    defaults: { email: false, slack: true },
  },
  INVOICE_SEND_FAILED: {
    label: "A scheduled invoice couldn't be sent",
    hint: "The invoice stays a draft until you send it or schedule it again.",
    defaults: { email: true, slack: true },
  },
  TASK_DUE_SOON: {
    label: "A task is due tomorrow",
    hint: "Goes to the task's assignee only (in the app, and by email to them). Slack gets it too if you turn it on.",
    defaults: { email: true, slack: false },
  },
  NEW_LEAD: {
    label: "A new client books a call",
    hint: "Someone you don't know yet books through Cal.com or Calendly. They're added as a draft client for you to review.",
    defaults: { email: true, slack: true },
  },
  DEADLINE_OVERDUE: {
    label: "A task or milestone is overdue",
    hint: "An overdue task goes to its assignee; an overdue milestone or deliverable to owners, admins and the project's members. On a confidential project, Slack and email leave out the names.",
    defaults: { email: true, slack: true },
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
