import type { Metadata } from "next";
import { requireOrgContext } from "@/lib/org-context";
import { AdminOnlyNotice } from "@/components/admin-only-notice";
import { isEmailConfigured } from "@/lib/email";
import { ALERT_EVENTS, channelsFor, type AlertEvent } from "@/lib/alert-events";
import { AlertSettingsForm } from "./alert-settings-form";

export const metadata: Metadata = { title: "Alerts" };

export default async function AlertSettingsPage() {
  const { org, role } = await requireOrgContext();
  if (role !== "OWNER" && role !== "ADMIN") return <AdminOnlyNotice what="alert settings" />;

  const events = (Object.keys(ALERT_EVENTS) as AlertEvent[]).map((event) => ({
    event,
    label: ALERT_EVENTS[event].label,
    hint: ALERT_EVENTS[event].hint,
    ...channelsFor(org.alertSettings, event),
  }));

  return (
    <AlertSettingsForm
      events={events}
      alertEmails={org.alertEmails}
      slackConfigured={!!org.slackWebhookUrl}
      emailConfigured={await isEmailConfigured()}
    />
  );
}
