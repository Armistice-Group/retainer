import "server-only";
import { prisma } from "@/lib/prisma";
import { sendAlert } from "@/lib/alerts";
import { paymentTermsLabel } from "@/lib/payment-terms";
import { paymentTypeDef, type PaymentMethodType } from "@/lib/payment-methods";

type Row = Record<string, unknown>;
type Change = { from?: unknown; to?: unknown };

// Fields whose change alerts the org, per model. `null` means any change
// (including adding or removing the row) counts.
const BILLING_FIELDS: Record<string, string[] | null> = {
  Organization: [
    "paymentInstructions",
    "paymentInstructionsPrivate",
    "defaultCurrency",
    "defaultTaxRate",
    "overheadPercent",
    "defaultPaymentTerms",
    "externalBillingUrl",
    "externalBillingLabel",
    "invoicePrefix",
    "stripeConnectAccountId",
  ],
  Client: [
    "billingEmail",
    "billingAddress",
    "paymentInstructions",
    "paymentInstructionsPrivate",
    "paymentTerms",
    "useOrgPaymentMethods",
    "excludedOrgPaymentMethodIds",
  ],
  Project: ["billingType", "flatFeeAmount", "paymentTerms"],
  ProjectMember: ["billRate", "currency"],
  Contact: ["receivesInvoices", "email"],
  PaymentMethod: null,
  ClientBillingCycle: null,
  RecurringInvoiceSchedule: null,
  MercuryConnection: null,
  QuickBooksConnection: null,
};

// Never put these values in an alert (Slack and email travel further than
// the audit log); say they changed instead.
const SENSITIVE = new Set(["details", "paymentInstructions"]);

const VERB: Record<string, string> = { create: "added", update: "changed", delete: "removed" };

function humanize(field: string) {
  return field
    .replace(/Id$/, "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase();
}

function show(value: unknown) {
  if (value === null || value === undefined || value === "") return "—";
  return String(value).slice(0, 120);
}

/** Called from the audit hook for every recorded write. Alerts when it
 * touched billing or payment details. Never throws. */
export async function alertOnBillingChange(entry: {
  orgId: string;
  actorId: string | null;
  model: string;
  action: string;
  row: Row | null;
  before: Row | null;
  changes: Record<string, unknown> | null;
  count: number | null;
}) {
  try {
    if (!(entry.model in BILLING_FIELDS)) return;
    const fields = BILLING_FIELDS[entry.model];

    // Which watched fields this write touched.
    let touched: string[] = [];
    if (entry.action === "update") {
      touched = Object.keys(entry.changes ?? {}).filter((f) => !fields || fields.includes(f));
      if (touched.length === 0) return;
    } else if (fields) {
      // Rows of field-scoped models only matter on create/delete when they
      // carry billing meaning on their own.
      if (entry.model === "ProjectMember") touched = ["billRate"];
      else if (entry.model === "Contact" && entry.row?.receivesInvoices === true) {
        touched = ["receivesInvoices"];
      } else return;
    }

    const subject = await describe(entry.model, entry.row ?? entry.before);
    if (!subject) return;
    const actorName = entry.actorId
      ? ((await prisma.user.findUnique({ where: { id: entry.actorId }, select: { name: true } }))
          ?.name ?? "Someone")
      : "Consultainer";

    const verb =
      entry.count !== null
        ? `${VERB[entry.action] ?? entry.action} ${entry.count}`
        : (VERB[entry.action] ?? entry.action);
    const details =
      entry.action === "update"
        ? touched.map((field) => {
            const c = (entry.changes?.[field] ?? {}) as Change;
            if (SENSITIVE.has(field) || entry.model === "PaymentMethod") {
              return `${humanize(field)} updated`;
            }
            const fmt = (v: unknown) =>
              /paymentTerms$/i.test(field) && typeof v === "string" ? paymentTermsLabel(v) : show(v);
            return `${humanize(field)}: ${fmt(c.from)} → ${fmt(c.to)}`;
          })
        : [];

    await sendAlert({
      orgId: entry.orgId,
      event: "BILLING_CHANGED",
      message: `${actorName} ${verb} ${subject.text}.`,
      link: subject.link,
      details,
      excludeUserId: entry.actorId,
    });
  } catch (err) {
    console.warn("[billing-alerts] Failed", entry.model, err);
  }
}

async function clientName(clientId: unknown) {
  if (typeof clientId !== "string") return null;
  const c = await prisma.client.findUnique({ where: { id: clientId }, select: { name: true } });
  return c?.name ?? null;
}

async function describe(model: string, row: Row | null): Promise<{ text: string; link: string } | null> {
  if (!row) return null;
  switch (model) {
    case "Organization":
      return { text: "the organization's billing settings", link: "/settings" };
    case "Client":
      return { text: `billing details for ${row.name}`, link: `/clients/${row.id}` };
    case "Project": {
      const client = await clientName(row.clientId);
      return {
        text: `billing for project ${row.name}${client ? ` (${client})` : ""}`,
        link: `/projects/${row.id}`,
      };
    }
    case "ProjectMember": {
      const [user, project] = await Promise.all([
        typeof row.userId === "string"
          ? prisma.user.findUnique({ where: { id: row.userId }, select: { name: true } })
          : null,
        typeof row.projectId === "string"
          ? prisma.project.findUnique({ where: { id: row.projectId }, select: { name: true } })
          : null,
      ]);
      return {
        text: `${user?.name ?? "a member"}'s rate on ${project?.name ?? "a project"}`,
        link: `/projects/${row.projectId}`,
      };
    }
    case "Contact": {
      const client = await clientName(row.clientId);
      return {
        text: `invoice contact ${row.name}${client ? ` at ${client}` : ""}`,
        link: `/clients/${row.clientId}`,
      };
    }
    case "PaymentMethod": {
      const type = paymentTypeDef(row.type as PaymentMethodType).name;
      const name = row.label ? `"${row.label}" (${type})` : type;
      const client = await clientName(row.clientId);
      return client
        ? { text: `payment method ${name} for ${client}`, link: `/clients/${row.clientId}` }
        : {
            text: `organization payment method ${name}`,
            link: "/settings/payments#payment-methods",
          };
    }
    case "ClientBillingCycle": {
      const client = await clientName(row.clientId);
      return { text: `the billing cycle for ${client ?? "a client"}`, link: `/clients/${row.clientId}` };
    }
    case "RecurringInvoiceSchedule": {
      const client = await clientName(row.clientId);
      return {
        text: `recurring invoice "${row.description}" for ${client ?? "a client"}`,
        link: `/clients/${row.clientId}`,
      };
    }
    case "MercuryConnection":
      return { text: "the Mercury connection", link: "/settings/payments" };
    case "QuickBooksConnection":
      return { text: "the QuickBooks connection", link: "/settings/integrations" };
    default:
      return null;
  }
}
