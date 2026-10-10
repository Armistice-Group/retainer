import Link from "next/link";
import {
  Clock,
  FolderKanban,
  FileWarning,
  Building2,
  ArrowRight,
  ListTodo,
  Timer,
  Send,
  Receipt,
  CalendarDays,
} from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireOrgContext } from "@/lib/org-context";
import { invoiceVisibilityWhere, projectVisibilityWhere } from "@/lib/project-access";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/status-badge";
import { PageHeader } from "@/components/layout/page-header";
import { formatCurrency, formatDate } from "@/lib/format";
import { isOverdue } from "@/lib/invoice-aging";
import { balanceDue } from "@/lib/invoice-balance";
import { MaximizeValueCard, type MaximizeValueItem } from "./maximize-value-card";
import { pendingExpenses } from "@/lib/services/expense-alerts";
import { cookies } from "next/headers";
import { isValidTimeZone, upcomingItems } from "@/lib/services/calendar-items";
import { CALENDAR_STYLE } from "@/components/calendar/item-style";
import { cn } from "@/lib/utils";

function startOfWeek(date: Date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = (day === 0 ? -6 : 1) - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

export default async function DashboardPage() {
  const { org, user, role } = await requireOrgContext();
  const weekStart = startOfWeek(new Date());

  const canManage = role === "OWNER" || role === "ADMIN";

  const [
    weekHours,
    activeProjects,
    outstandingInvoices,
    recentEntries,
    myTasks,
    unbilledEntries,
    quickbooksConnection,
    linearConnection,
    apiKeyCount,
    paymentMethodCount,
    setupCardDismissed,
  ] = await Promise.all([
      prisma.timeEntry.aggregate({
        where: { orgId: org.id, userId: user.id, date: { gte: weekStart } },
        _sum: { hours: true },
      }),
      prisma.project.count({
        where: { orgId: org.id, status: "ACTIVE", ...projectVisibilityWhere(user.id, role) },
      }),
      prisma.invoice.findMany({
        where: { orgId: org.id, status: { in: ["SENT", "DRAFT"] }, ...invoiceVisibilityWhere(user.id, role) },
        select: { total: true, amountPaid: true, creditApplied: true, status: true, dueDate: true },
      }),
      prisma.timeEntry.findMany({
        where: { orgId: org.id, userId: user.id },
        include: { project: { include: { client: true } } },
        orderBy: { date: "desc" },
        take: 5,
      }),
      prisma.task.findMany({
        where: { assigneeId: user.id, status: { not: "DONE" }, project: { orgId: org.id } },
        include: { project: true },
        orderBy: { createdAt: "desc" },
        take: 5,
      }),
      prisma.timeEntry.findMany({
        where: {
          orgId: org.id,
          billable: true,
          invoiceLineItemId: null,
          project: projectVisibilityWhere(user.id, role),
        },
        select: { hours: true, rateOverride: true, projectId: true, userId: true },
      }),
      prisma.quickBooksConnection.findUnique({ where: { orgId: org.id } }),
      prisma.linearConnection.findUnique({ where: { orgId: org.id } }),
      prisma.apiKey.count({ where: { userId: user.id, revokedAt: null } }),
      prisma.paymentMethod.count({ where: { orgId: org.id, clientId: null } }),
      prisma.user
        .findUnique({ where: { id: user.id }, select: { setupCardDismissedAt: true } })
        .then((u) => !!u?.setupCardDismissedAt),
    ]);

  // Owners/admins approve expenses (and can see every project).
  const expensesToApprove = canManage ? await pendingExpenses(org.id) : null;

  // Next two weeks of deadlines (same data as /calendar).
  let tz: string | undefined;
  try {
    const raw = (await cookies()).get("tz")?.value;
    tz = raw ? decodeURIComponent(raw) : undefined;
  } catch {
    tz = undefined;
  }
  const upcoming = await upcomingItems({ orgId: org.id, userId: user.id, role }, tz);
  const upcomingTime = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: isValidTimeZone(tz) ? tz : "UTC",
  });

  const outstandingTotal = outstandingInvoices
    .filter((i) => i.status === "SENT")
    // What's still owed: part payments and applied credit come off.
    .reduce((sum, i) => sum + balanceDue(i), 0);
  const draftInvoices = outstandingInvoices.filter((i) => i.status === "DRAFT");
  const draftCount = draftInvoices.length;
  const draftTotal = draftInvoices.reduce((sum, i) => sum + Number(i.total), 0);
  const overdueInvoices = outstandingInvoices.filter((i) => isOverdue(i.status, i.dueDate));
  const overdueTotal = overdueInvoices.reduce((sum, i) => sum + balanceDue(i), 0);

  const unbilledHours = unbilledEntries.reduce((sum, e) => sum + Number(e.hours), 0);
  const unbilledProjectMembers = await prisma.projectMember.findMany({
    where: { projectId: { in: [...new Set(unbilledEntries.map((e) => e.projectId))] } },
    select: { projectId: true, userId: true, billRate: true },
  });
  const unbilledValue = unbilledEntries.reduce((sum, e) => {
    const rate =
      e.rateOverride != null
        ? Number(e.rateOverride)
        : Number(
            unbilledProjectMembers.find(
              (pm) => pm.projectId === e.projectId && pm.userId === e.userId
            )?.billRate ?? 0
          );
    return sum + Number(e.hours) * rate;
  }, 0);

  const maximizeValueItems: MaximizeValueItem[] = [
    {
      key: "quickbooks",
      label: "Sync invoices to QuickBooks",
      description: "Push invoices to your books in one click instead of re-entering them.",
      href: "/settings/integrations",
      done: !!quickbooksConnection,
    },
    {
      key: "linear",
      label: "Pull tasks in from Linear",
      description: "Assign real backlog items instead of a bucket of hours.",
      href: "/settings/integrations",
      done: !!linearConnection,
    },
    {
      key: "slack",
      label: "Get Slack alerts on invoices & time",
      description: "Hear when an invoice is sent, opened, paid, or goes overdue.",
      href: "/settings#slackWebhookUrl",
      done: !!org.slackWebhookUrl,
    },
    {
      key: "payment",
      label: "Add how clients can pay you",
      description: "ACH, wire, a Stripe link, check details — clients can have their own.",
      href: "/settings/payments#payment-methods",
      done: paymentMethodCount > 0,
    },
    {
      key: "mcp",
      label: "Connect Claude or another AI agent",
      description: "Log hours and draft invoices straight from the agent doing the work.",
      href: "/profile#api-keys",
      done: apiKeyCount > 0,
    },
  ];

  return (
    <div>
      <PageHeader title={`Welcome back, ${user.name?.split(" ")[0] ?? ""}`} />

      {canManage && !setupCardDismissed ? <MaximizeValueCard items={maximizeValueItems} /> : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Your hours this week
            </CardTitle>
            <Clock className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="tabular-figures text-2xl font-semibold">
              {Number(weekHours._sum.hours ?? 0).toFixed(1)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Active projects
            </CardTitle>
            <FolderKanban className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="tabular-figures text-2xl font-semibold">{activeProjects}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Unbilled hours
            </CardTitle>
            <Timer className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="tabular-figures text-2xl font-semibold">{unbilledHours.toFixed(1)}</p>
            {unbilledHours > 0 ? (
              <p className="mt-1 text-xs text-muted-foreground">
                ~{formatCurrency(unbilledValue, org.defaultCurrency)} not yet invoiced
              </p>
            ) : (
              <p className="mt-1 text-xs text-muted-foreground">Everything billable is invoiced</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Outstanding invoices
            </CardTitle>
            <FileWarning className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="tabular-figures text-2xl font-semibold">
              {formatCurrency(outstandingTotal, org.defaultCurrency)}
            </p>
            {draftCount > 0 ? (
              <p className="mt-1 text-xs text-muted-foreground">
                {formatCurrency(draftTotal, org.defaultCurrency)} in {draftCount} draft
                {draftCount === 1 ? "" : "s"} not yet sent
              </p>
            ) : null}
            {overdueInvoices.length > 0 ? (
              <p className="mt-1 text-xs font-medium text-destructive">
                {formatCurrency(overdueTotal, org.defaultCurrency)} overdue ({overdueInvoices.length})
              </p>
            ) : null}
          </CardContent>
        </Card>
      </div>

      {expensesToApprove && expensesToApprove.count > 0 ? (
        <Card className="mt-4">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <Receipt className="size-4 text-muted-foreground" />
              Expenses waiting for approval ({expensesToApprove.count})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col divide-y divide-border">
              {expensesToApprove.items.map((e) => (
                <Link
                  key={e.id}
                  href={`/projects/${e.project.id}#expenses`}
                  className="flex items-center justify-between gap-2 py-3 text-sm hover:underline"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{e.description}</p>
                    <p className="text-xs text-muted-foreground">
                      {e.project.name} · {e.submittedBy.name} · {formatDate(e.incurredAt)}
                    </p>
                  </div>
                  <span className="tabular-figures shrink-0">
                    {formatCurrency(Number(e.amount), org.defaultCurrency)}
                  </span>
                </Link>
              ))}
            </div>
            {expensesToApprove.count > expensesToApprove.items.length ? (
              <p className="mt-2 text-xs text-muted-foreground">
                Showing the oldest {expensesToApprove.items.length}. Approve or reject them on each
                project&apos;s Expenses card.
              </p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <Card className="mt-4">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Upcoming</CardTitle>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/calendar">
              Calendar <ArrowRight className="size-3.5" />
            </Link>
          </Button>
        </CardHeader>
        <CardContent>
          {upcoming.length === 0 ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <CalendarDays className="size-4" /> Nothing due or booked in the next two weeks.
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {upcoming.map((item) => {
                const { icon: Icon, className } = CALENDAR_STYLE[item.type];
                return (
                  <li key={item.key}>
                    <Link
                      href={item.href}
                      className="flex items-center gap-3 py-2.5 text-sm hover:underline"
                    >
                      <Icon className={cn("size-4 shrink-0", className)} />
                      <span className="min-w-0 flex-1">
                        <span className={cn("block truncate font-medium", item.overdue && "text-destructive")}>
                          {item.title}
                        </span>
                        {item.detail ? (
                          <span className="block truncate text-xs text-muted-foreground">{item.detail}</span>
                        ) : null}
                      </span>
                      <span className="shrink-0 tabular-figures text-xs text-muted-foreground">
                        {formatDate(item.day)}
                        {item.start ? ` · ${upcomingTime.format(new Date(item.start))}` : ""}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <div className="mt-8 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Recent time entries</CardTitle>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/time">
                View all <ArrowRight className="size-3.5" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {recentEntries.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No time logged yet.{" "}
                <Link href="/time" className="text-brand hover:underline">
                  Log your first entry
                </Link>
                .
              </p>
            ) : (
              <div className="flex flex-col divide-y divide-border">
                {recentEntries.map((entry) => (
                  <div key={entry.id} className="flex items-center justify-between py-3 text-sm">
                    <div>
                      <p className="font-medium">{entry.project.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {entry.project.client.name} · {formatDate(entry.date)}
                      </p>
                    </div>
                    <span className="tabular-figures text-sm">{Number(entry.hours).toFixed(2)}h</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Quick links</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-1">
            <Button variant="ghost" className="justify-start" asChild>
              <Link href="/clients/new">
                <Building2 className="size-4" /> Add a client
              </Link>
            </Button>
            <Button variant="ghost" className="justify-start" asChild>
              <Link href="/projects/new">
                <FolderKanban className="size-4" /> Start a project
              </Link>
            </Button>
            <Button variant="ghost" className="justify-start" asChild>
              <Link href="/time">
                <Clock className="size-4" /> Log time
              </Link>
            </Button>
            <Button variant="ghost" className="justify-start" asChild>
              <Link href="/invoices/new">
                <Send className="size-4" /> Send invoice
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Your open tasks</CardTitle>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/tasks">View all</Link>
          </Button>
        </CardHeader>
        <CardContent>
          {myTasks.length === 0 ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <ListTodo className="size-4" /> Nothing assigned to you right now.
            </p>
          ) : (
            <div className="flex flex-col divide-y divide-border">
              {myTasks.map((task) => (
                <Link
                  key={task.id}
                  href={`/tasks?task=${task.id}`}
                  className="flex items-center justify-between gap-2 py-3 text-sm hover:underline"
                >
                  <div>
                    <p className="font-medium">{task.title}</p>
                    <p className="text-xs text-muted-foreground">{task.project.name}</p>
                  </div>
                  <StatusBadge status={task.status} />
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
