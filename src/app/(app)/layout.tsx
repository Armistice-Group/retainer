import Link from "next/link";
import { requireOrgContext } from "@/lib/org-context";
import { prisma } from "@/lib/prisma";
import { projectVisibilityWhere } from "@/lib/project-access";
import { SidebarNav } from "@/components/layout/sidebar-nav";
import { Wordmark } from "@/components/brand-mark";
import { OrgBrand } from "@/components/org-brand";
import { BrandAccentStyle } from "@/components/brand-accent-style";
import { orgLogoUrl } from "@/lib/branding";
import { OrgSwitcher } from "@/components/layout/org-switcher";
import { UserMenu } from "@/components/layout/user-menu";
import { ThemeToggle } from "@/components/theme-toggle";
import { NotificationBell } from "@/components/layout/notification-bell";
import { TimerWidget, type ActiveTimerData } from "@/components/layout/timer-widget";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, org, role, memberships } = await requireOrgContext();
  const orgOptions = memberships.map((m) => ({
    orgId: m.orgId,
    role: m.role,
    org: { id: m.org.id, name: m.org.name },
  }));

  const [notifications, activeTimerRow, projects, tasks] = await Promise.all([
    prisma.notification.findMany({
      where: { userId: user.id, orgId: org.id },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    prisma.activeTimer.findUnique({
      where: { userId: user.id },
      include: { project: true, task: true },
    }),
    prisma.project.findMany({
      where: { orgId: org.id, status: "ACTIVE", ...projectVisibilityWhere(user.id, role) },
      include: { client: true },
      orderBy: [{ client: { name: "asc" } }, { name: "asc" }],
    }),
    prisma.task.findMany({
      where: { project: { orgId: org.id, ...projectVisibilityWhere(user.id, role) } },
      select: { id: true, title: true, projectId: true },
    }),
  ]);

  const activeTimer: ActiveTimerData | null = activeTimerRow
    ? {
        startedAt: activeTimerRow.startedAt.toISOString(),
        description: activeTimerRow.description,
        projectId: activeTimerRow.projectId,
        projectName: activeTimerRow.project.name,
        taskId: activeTimerRow.taskId,
        taskTitle: activeTimerRow.task?.title ?? null,
      }
    : null;

  const projectOptions = projects.map((p) => ({
    id: p.id,
    name: p.name,
    clientName: p.client.name,
  }));

  return (
    <div className="flex min-h-screen w-full">
      {org.appAccentFromBrand ? <BrandAccentStyle color={org.brandColor} /> : null}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar md:flex">
        <div className="flex h-14 items-center border-b border-sidebar-border px-4">
          <Link href="/dashboard" className="min-w-0 text-base">
            {org.appBranding ? <OrgBrand name={org.name} logoUrl={orgLogoUrl(org)} /> : <Wordmark />}
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
        <header className="flex h-14 items-center gap-2 border-b border-border px-4 md:px-6">
          <TimerWidget activeTimer={activeTimer} projects={projectOptions} tasks={tasks} />
          <div className="ml-auto flex items-center gap-2">
            <NotificationBell notifications={notifications} />
            <ThemeToggle />
            <UserMenu name={user.name ?? user.email ?? "User"} email={user.email ?? ""} />
          </div>
        </header>
        <main className="flex-1 overflow-y-auto bg-background px-4 py-6 md:px-8 md:py-8">
          <div className="mx-auto w-full max-w-6xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
