import Link from "next/link";
import { Clock, FolderKanban, FileWarning, Building2, ArrowRight, ListTodo } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireOrgContext } from "@/lib/org-context";
import { projectVisibilityWhere } from "@/lib/project-access";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/status-badge";
import { PageHeader } from "@/components/layout/page-header";
import { formatCurrency, formatDate } from "@/lib/format";
import { isOverdue } from "@/lib/invoice-aging";

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

  const [weekHours, activeProjects, outstandingInvoices, recentEntries, myTasks] =
    await Promise.all([
      prisma.timeEntry.aggregate({
        where: { orgId: org.id, userId: user.id, date: { gte: weekStart } },
        _sum: { hours: true },
      }),
      prisma.project.count({
        where: { orgId: org.id, status: "ACTIVE", ...projectVisibilityWhere(user.id, role) },
      }),
      prisma.invoice.findMany({
        where: { orgId: org.id, status: { in: ["SENT", "DRAFT"] } },
        select: { total: true, status: true, dueDate: true },
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
    ]);

  const outstandingTotal = outstandingInvoices
    .filter((i) => i.status === "SENT")
    .reduce((sum, i) => sum + Number(i.total), 0);
  const draftCount = outstandingInvoices.filter((i) => i.status === "DRAFT").length;
  const overdueInvoices = outstandingInvoices.filter((i) => isOverdue(i.status, i.dueDate));
  const overdueTotal = overdueInvoices.reduce((sum, i) => sum + Number(i.total), 0);

  return (
    <div>
      <PageHeader title={`Welcome back, ${user.name?.split(" ")[0] ?? ""}`} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
              Outstanding invoices
            </CardTitle>
            <FileWarning className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="tabular-figures text-2xl font-semibold">
              {formatCurrency(outstandingTotal, org.defaultCurrency)}
            </p>
            {draftCount > 0 ? (
              <p className="mt-1 text-xs text-muted-foreground">{draftCount} draft{draftCount === 1 ? "" : "s"} not yet sent</p>
            ) : null}
            {overdueInvoices.length > 0 ? (
              <p className="mt-1 text-xs font-medium text-destructive">
                {formatCurrency(overdueTotal, org.defaultCurrency)} overdue ({overdueInvoices.length})
              </p>
            ) : null}
          </CardContent>
        </Card>
      </div>

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
                <Link href="/time" className="text-primary hover:underline">
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
          </CardContent>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Your open tasks</CardTitle>
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
                  href={`/projects/${task.projectId}`}
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
