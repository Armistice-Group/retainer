import { Bell } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireOrgContext } from "@/lib/org-context";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { markAllNotificationsReadAction } from "@/actions/notifications";
import { NotificationRow } from "./notification-row";

const NOTIFICATIONS_LIMIT = 100;

export default async function NotificationsPage() {
  const { user, org } = await requireOrgContext();

  const notifications = await prisma.notification.findMany({
    where: { userId: user.id, orgId: org.id },
    orderBy: { createdAt: "desc" },
    take: NOTIFICATIONS_LIMIT,
  });

  const unreadCount = notifications.filter((n) => !n.readAt).length;

  return (
    <div>
      <PageHeader
        title="Notifications"
        description={unreadCount > 0 ? `${unreadCount} unread` : "You're all caught up."}
        actions={
          unreadCount > 0 ? (
            <form action={markAllNotificationsReadAction}>
              <Button variant="outline" size="sm" type="submit">
                Mark all read
              </Button>
            </form>
          ) : undefined
        }
      />

      {notifications.length === 0 ? (
        <EmptyState
          icon={Bell}
          title="No notifications yet"
          description="You'll see updates here when invoices are sent or paid, time is logged, tasks are assigned, and more."
        />
      ) : (
        <div className="flex flex-col divide-y divide-border rounded-md border border-border">
          {notifications.map((n) => (
            <NotificationRow
              key={n.id}
              id={n.id}
              type={n.type}
              message={n.message}
              link={n.link}
              readAt={n.readAt}
              createdAt={n.createdAt}
            />
          ))}
        </div>
      )}

      {notifications.length === NOTIFICATIONS_LIMIT ? (
        <p className="mt-3 text-center text-xs text-muted-foreground">
          Showing your most recent {NOTIFICATIONS_LIMIT} notifications.
        </p>
      ) : null}
    </div>
  );
}
