"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireOrgContext, requireRole } from "@/lib/org-context";
import { ALERT_EVENTS, type AlertEvent, type AlertSettings } from "@/lib/alert-events";
import type { ActionState } from "@/actions/auth";

const emailList = z.array(z.string().trim().toLowerCase().email()).max(20);

export async function saveAlertSettingsAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const { org, role } = await requireOrgContext();
  requireRole(role, ["OWNER", "ADMIN"]);

  const settings: AlertSettings = {};
  for (const event of Object.keys(ALERT_EVENTS) as AlertEvent[]) {
    settings[event] = {
      email: formData.get(`${event}.email`) === "on",
      slack: formData.get(`${event}.slack`) === "on",
    };
  }
  const raw = ((formData.get("alertEmails") as string | null) ?? "")
    .split(/[\s,;]+/)
    .filter(Boolean);
  const emails = emailList.safeParse([...new Set(raw)]);
  if (!emails.success) {
    return { fieldErrors: { alertEmails: ["Enter up to 20 valid email addresses."] } };
  }

  await prisma.organization.update({
    where: { id: org.id },
    data: { alertSettings: settings, alertEmails: emails.data },
  });
  revalidatePath("/settings/alerts");
  return { saved: true };
}
