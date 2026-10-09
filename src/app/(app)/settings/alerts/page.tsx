import { notFound } from "next/navigation";
import { requireOrgContext } from "@/lib/org-context";
import { isEmailConfigured } from "@/lib/email";
import { ALERT_EVENTS, channelsFor, type AlertEvent } from "@/lib/alert-events";
import { AlertSettingsForm } from "./alert-settings-form";

export default async function AlertSettingsPage() {
  const { org, role } = await requireOrgContext();
  if (role !== "OWNER" && role !== "ADMIN") notFound();

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
