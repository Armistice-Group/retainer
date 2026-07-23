import "server-only";
import { prisma } from "@/lib/prisma";
import type { Prisma, NotificationType } from "@/generated/prisma/client";

type Db = Prisma.TransactionClient | typeof prisma;

export async function notify(
  db: Db,
  params: { orgId: string; userIds: string[]; type: NotificationType; message: string; link?: string }
) {
  const { orgId, userIds, type, message, link } = params;
  const recipients = [...new Set(userIds)];
  if (recipients.length === 0) return;

  await db.notification.createMany({
    data: recipients.map((userId) => ({ orgId, userId, type, message, link })),
  });
}

export async function getOrgAdminUserIds(db: Db, orgId: string, excludeUserId?: string) {
  const admins = await db.membership.findMany({
    where: { orgId, role: { in: ["OWNER", "ADMIN"] } },
    select: { userId: true },
  });
  return admins.map((m) => m.userId).filter((id) => id !== excludeUserId);
}

export async function getOrgOwnerEmail(db: Db, orgId: string) {
  const owner = await db.membership.findFirst({
    where: { orgId, role: "OWNER" },
    include: { user: true },
    orderBy: { createdAt: "asc" },
  });
  return owner?.user.email ?? null;
}
