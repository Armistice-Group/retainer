import Link from "next/link";
import { requireOrgContext } from "@/lib/org-context";
import { prisma } from "@/lib/prisma";
import { SidebarNav } from "@/components/layout/sidebar-nav";
import { OrgSwitcher } from "@/components/layout/org-switcher";
import { UserMenu } from "@/components/layout/user-menu";
import { ThemeToggle } from "@/components/theme-toggle";
import { NotificationBell } from "@/components/layout/notification-bell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, org, memberships } = await requireOrgContext();
  const orgOptions = memberships.map((m) => ({
    orgId: m.orgId,
    role: m.role,
    org: { id: m.org.id, name: m.org.name },
  }));

  const notifications = await prisma.notification.findMany({
    where: { userId: user.id, orgId: org.id },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  return (
    <div className="flex min-h-screen w-full">
      <aside className="hidden w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar md:flex">
        <div className="flex h-14 items-center border-b border-sidebar-border px-4">
          <Link href="/dashboard" className="text-base font-semibold tracking-tight">
            <span className="text-primary">Consultainer</span>
          </Link>
        </div>
        <div className="border-b border-sidebar-border py-2">
          <OrgSwitcher memberships={orgOptions} activeOrgId={org.id} />
        </div>
        <div className="flex-1 overflow-y-auto py-3">
          <SidebarNav />
        </div>
      </aside>

      <div className="flex min-h-screen flex-1 flex-col">
        <header className="flex h-14 items-center justify-end gap-2 border-b border-border px-4 md:px-6">
          <NotificationBell notifications={notifications} />
          <ThemeToggle />
          <UserMenu name={user.name ?? user.email ?? "User"} email={user.email ?? ""} />
        </header>
        <main className="flex-1 overflow-y-auto bg-background px-4 py-6 md:px-8 md:py-8">
          <div className="mx-auto w-full max-w-6xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
