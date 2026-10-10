"use server";

import { revalidatePath } from "next/cache";
import { requireOrgContext } from "@/lib/org-context";
import {
  regenerateCalendarSubscription,
  revokeCalendarSubscription,
} from "@/lib/services/calendar-subscription";

/** Creates your calendar address for the org you have open, or replaces it
 * (the old one stops working). Returns the address — shown once. */
export async function createCalendarSubscriptionAction(): Promise<{ url: string }> {
  const { org, user } = await requireOrgContext();
  const url = await regenerateCalendarSubscription(user.id, org.id);
  revalidatePath("/profile");
  return { url };
}

export async function revokeCalendarSubscriptionAction() {
  const { org, user } = await requireOrgContext();
  await revokeCalendarSubscription(user.id, org.id);
  revalidatePath("/profile");
}
