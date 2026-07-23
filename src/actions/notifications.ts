"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireOrgContext } from "@/lib/org-context";

export async function markNotificationReadAction(notificationId: string) {
  const { user } = await requireOrgContext();
  await prisma.notification.updateMany({
    where: { id: notificationId, userId: user.id, readAt: null },
    data: { readAt: new Date() },
  });
  revalidatePath("/", "layout");
}

export async function markAllNotificationsReadAction() {
  const { user, org } = await requireOrgContext();
  await prisma.notification.updateMany({
    where: { userId: user.id, orgId: org.id, readAt: null },
    data: { readAt: new Date() },
  });
  revalidatePath("/", "layout");
}
