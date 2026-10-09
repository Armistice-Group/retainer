import "server-only";
import { prisma } from "@/lib/prisma";
import { notify, getOrgAdminUserIds } from "@/lib/notifications";
import { postToSlack } from "@/lib/slack";
import { sendEmail } from "@/lib/email";
import { AlertEmail } from "@/emails/alert-email";
import { getOrigin } from "@/lib/url";
import { channelsFor, type AlertEvent } from "@/lib/alert-events";
import type { NotificationType } from "@/generated/prisma/client";

/** Who alert emails go to: the org's list when it has one, otherwise its
 * owners. */
export async function alertRecipients(orgId: string, configured: string[]) {
  if (configured.length) return configured;
  const owners = await prisma.membership.findMany({
    where: { orgId, role: "OWNER" },
    include: { user: { select: { email: true } } },
  });
  return owners.map((o) => o.user.email);
}

/** Sends an org alert: in-app to owners and admins (always), and to Slack
 * and email per the org's alert settings (Settings → Alerts). Never throws. */
export async function sendAlert(params: {
  orgId: string;
  event: AlertEvent;
  /** Defaults to the event name; must exist on NotificationType. */
  notificationType?: NotificationType;
  message: string;
  /** In-app path, e.g. /invoices/abc. */
  link: string;
  /** Extra lines for email and Slack (e.g. what changed). */
  details?: string[];
  /** Skip this user's in-app notification (they did the thing). */
  excludeUserId?: string | null;
  /** In-app recipients beyond owners/admins (e.g. a task's assignee). */
  alsoNotify?: string[];
}) {
  try {
    const org = await prisma.organization.findUnique({
      where: { id: params.orgId },
      select: { name: true, slackWebhookUrl: true, alertSettings: true, alertEmails: true },
    });
    if (!org) return;
    const channels = channelsFor(org.alertSettings, params.event);

    const admins = await getOrgAdminUserIds(prisma, params.orgId);
    await notify(prisma, {
      orgId: params.orgId,
      userIds: [...admins, ...(params.alsoNotify ?? [])].filter(
        (id) => id !== params.excludeUserId
      ),
      type: params.notificationType ?? (params.event as NotificationType),
      message: params.message,
      link: params.link,
    });

    const details = params.details ?? [];
    if (channels.slack) {
      await postToSlack(
        org.slackWebhookUrl,
        [params.message, ...details.map((d) => `• ${d}`)].join("\n")
      );
    }
    if (channels.email) {
      const origin = await getOrigin().catch(() => "");
      const url = `${origin}${params.link}`;
      for (const to of await alertRecipients(params.orgId, org.alertEmails)) {
        await sendEmail({
          to,
          subject: params.message.slice(0, 150),
          react: AlertEmail({
            orgName: org.name,
            headline: headlineFor(params.event),
            message: params.message,
            details,
            url,
            origin,
          }),
        });
      }
    }
  } catch (err) {
    console.warn("[alerts] Failed to send", params.event, err);
  }
}

function headlineFor(event: AlertEvent) {
  switch (event) {
    case "INVOICE_VIEWED":
      return "Invoice opened";
    case "BILLING_CHANGED":
      return "Billing details changed";
    case "INVOICE_SENT":
      return "Invoice sent";
    case "INVOICE_PAID":
      return "Invoice paid";
    case "INVOICE_OVERDUE":
      return "Invoice overdue";
    case "BUDGET_ALERT":
      return "Budget alert";
    case "TIMESHEET_SUBMITTED":
      return "Timesheet submitted";
    case "WEEKLY_DIGEST":
      return "Weekly digest";
  }
}
