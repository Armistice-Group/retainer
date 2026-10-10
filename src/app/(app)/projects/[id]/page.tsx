import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil, Trash2, Users, ListTodo, Lock } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireOrgContext } from "@/lib/org-context";
import { canViewProject } from "@/lib/project-access";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/status-badge";
import { PageHeader } from "@/components/layout/page-header";
import { LinkList } from "@/components/link-list";
import { DocumentsCard } from "@/components/documents/documents-card";
import { documentCardData } from "@/lib/services/documents";
import { AgreementsCard } from "@/components/agreements/agreements-card";
import { agreementsCardData } from "@/lib/services/agreements";
import { AddLinkDialog } from "@/components/forms/add-link-dialog";
import { AddMemberDialog } from "./add-member-dialog";
import { EditRateDialog } from "./edit-rate-dialog";
import { AddTaskDialog } from "@/components/tasks/add-task-dialog";
import { TaskList } from "./task-list";
import { ProjectBillingCard, type ProjectInvoiceItem } from "./project-billing-card";
import { deleteProjectAction, removeProjectMemberAction } from "@/actions/projects";
import { ConfirmSubmitButton } from "@/components/forms/confirm-submit-button";
import { EmptyState } from "@/components/empty-state";
import { formatCurrency, formatDate } from "@/lib/format";
import { LinearSyncCard } from "./linear-sync-card";
import { canWrite } from "@/lib/integrations/linear";
import { MilestonesCard, type MilestoneItem } from "./milestones-card";
import { ExpensesCard, type ExpenseItem } from "./expenses-card";
import { ShareLinkCard } from "./share-link-card";
import { ProjectEstimates } from "@/components/estimates/project-estimates";
import { getOrigin } from "@/lib/url";
import { CopyButton } from "@/components/copy-button";
import { getTaskDetail } from "@/lib/task-detail";
import { resolveBillRate } from "@/lib/bill-rates";

export default async function ProjectDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ task?: string }>;
}) {
  const { id } = await params;
  const { task: openTaskId } = await searchParams;
  const { org, user, role } = await requireOrgContext();
  const canManage = role === "OWNER" || role === "ADMIN";
  const origin = canManage ? await getOrigin() : "";

  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      client: true,
      links: { orderBy: { createdAt: "asc" } },
      members: { include: { user: true }, orderBy: { createdAt: "asc" } },
      tasks: {
        include: { assignee: true, externalLink: true },
        orderBy: { createdAt: "desc" },
      },
      timeEntries: {
        include: { user: true },
        orderBy: { date: "desc" },
        take: 8,
      },
      externalLink: true,
      // Not the files' bytes — the page only needs to know they exist.
      milestones: {
        include: { completedBy: true },
        omit: { completionFileData: true },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      },
      expenses: {
        include: { submittedBy: true },
        omit: { receiptFileData: true },
        orderBy: { incurredAt: "desc" },
      },
    },
  });

  if (!project || project.orgId !== org.id) notFound();
  if (!(await canViewProject(project, user.id, role))) notFound();
  const agreementsCard = await agreementsCardData(
    { orgId: org.id, userId: user.id, role },
    { clientId: project.clientId, projectId: project.id }
  );

  const [
    totalLoggedHours,
    taskHoursByTask,
    linearConnection,
    orgMembers,
    projectLineItems,
    openTaskDetail,
    activeTimer,
  ] = await Promise.all([
    prisma.timeEntry.aggregate({ where: { projectId: project.id }, _sum: { hours: true } }),
    prisma.timeEntry.groupBy({
      by: ["taskId"],
      where: { projectId: project.id, taskId: { not: null } },
      _sum: { hours: true },
    }),
    prisma.linearConnection.findUnique({ where: { orgId: org.id } }),
    prisma.membership.findMany({ where: { orgId: org.id }, include: { user: true } }),
    prisma.invoiceLineItem.findMany({
      where: { projectId: project.id },
      include: { invoice: true },
      orderBy: { invoice: { createdAt: "desc" } },
    }),
    openTaskId && project.tasks.some((t) => t.id === openTaskId)
      ? getTaskDetail(openTaskId, { orgId: org.id, userId: user.id, role })
      : null,
    prisma.activeTimer.findUnique({ where: { userId: user.id }, select: { taskId: true } }),
  ]);

  const invoiceMap = new Map<string, ProjectInvoiceItem>();
  let invoicedTotal = 0;
  for (const li of projectLineItems) {
    const amount = Number(li.amount);
    // A deposit isn't work invoiced (the invoice for the work is).
    if (li.invoice.status !== "VOID" && li.invoice.kind !== "DEPOSIT") invoicedTotal += amount;
    const existing = invoiceMap.get(li.invoiceId);
    if (existing) {
      existing.lineItemTotal += amount;
    } else {
      invoiceMap.set(li.invoiceId, {
        id: li.invoice.id,
        number: li.invoice.number,
        status: li.invoice.status,
        dueDate: li.invoice.dueDate.toISOString(),
        lineItemTotal: amount,
        currency: li.invoice.currency,
        kind: li.invoice.kind,
        total: Number(li.invoice.total),
        amountPaid: Number(li.invoice.amountPaid),
        creditApplied: Number(li.invoice.creditApplied),
      });
    }
  }
  const projectInvoices = Array.from(invoiceMap.values());
  const actualHoursByTask = new Map(
    taskHoursByTask.map((t) => [t.taskId as string, Number(t._sum.hours ?? 0)])
  );
  const availableMembers = orgMembers
    .filter((m) => !project.members.some((pm) => pm.userId === m.userId))
    .map((m) => ({
      id: m.user.id,
      name: m.user.name,
      email: m.user.email,
      isContractor: m.employmentType === "CONTRACTOR",
      // Their default bill rate (own, else the org's) — prefilled in the
      // add dialog, which only owners and admins get.
      defaultRate: canManage ? resolveBillRate(m.billRate, org.defaultBillRate) : 0,
      hasOwnRate: canManage && m.billRate != null,
    }));
  const noDefaultRates =
    canManage && org.defaultBillRate == null && orgMembers.every((m) => m.billRate == null);
  const zeroRateMembers =
    canManage && project.billingType === "HOURLY"
      ? project.members.filter((m) => Number(m.billRate) === 0)
      : [];
  const projectMemberOptions = project.members.map((m) => ({
    id: m.user.id,
    name: m.user.name,
  }));
  const taskItems = project.tasks.map((t) => ({
    id: t.id,
    title: t.title,
    description: t.description,
    status: t.status,
    assigneeId: t.assigneeId,
    assigneeName: t.assignee?.name ?? null,
    estimatedHours: t.estimatedHours ? Number(t.estimatedHours) : null,
    actualHours: actualHoursByTask.get(t.id) ?? 0,
    linearKey: t.externalLink?.source === "linear" ? t.externalLink.externalKey : null,
    linearUrl: t.externalLink?.source === "linear" ? t.externalLink.externalUrl : null,
  }));

  const milestoneItems: MilestoneItem[] = project.milestones.map((m) => ({
    id: m.id,
    name: m.name,
    description: m.description,
    amount: Number(m.amount),
    dueDate: m.dueDate ? m.dueDate.toISOString() : null,
    completedAt: m.completedAt ? m.completedAt.toISOString() : null,
    completedByName: m.completedBy?.name ?? null,
    completionNote: m.completionNote,
    completionUrl: m.completionUrl,
    hasEvidenceFile: !!m.completionFileName,
    invoicedAt: m.invoicedAt ? m.invoicedAt.toISOString() : null,
  }));

  const expenseItems: ExpenseItem[] = project.expenses.map((e) => ({
    id: e.id,
    description: e.description,
    category: e.category,
    amount: Number(e.amount),
    incurredAt: e.incurredAt.toISOString(),
    status: e.status,
    submittedByName: e.submittedBy.name,
    hasReceipt: !!e.receiptFileName,
    invoicedAt: e.invoicedAt ? e.invoicedAt.toISOString() : null,
    canDelete: !e.invoiceLineItemId && (e.submittedById === user.id || canManage),
  }));

  return (
    <div>
      <PageHeader
        title={project.name}
        description={
          <>
            <Link href={`/clients/${project.client.id}`} className="hover:underline">
              {project.client.name}
            </Link>
          </>
        }
        actions={
          <>
            <Button variant="outline" size="sm" asChild>
              <Link href={`/projects/${project.id}/edit`}>
                <Pencil className="size-3.5" /> Edit
              </Link>
            </Button>
            {canManage ? (
              <form action={deleteProjectAction.bind(null, project.id, project.clientId)}>
                <ConfirmSubmitButton
                  variant="outline"
                  size="sm"
                  confirmMessage={`Delete ${project.name}? This also removes its time entries.`}
                >
                  <Trash2 className="size-3.5" /> Delete
                </ConfirmSubmitButton>
              </form>
            ) : null}
          </>
        }
      />

      <div className="mb-4 flex items-center gap-2">
        <StatusBadge status={project.status} />
        {project.confidential ? (
          <Badge variant="outline" className="gap-1 border-chart-4/40 text-chart-4">
            <Lock className="size-3" /> Confidential
          </Badge>
        ) : null}
      </div>

      {project.description ? (
        <p className="mb-6 max-w-3xl text-sm text-muted-foreground">{project.description}</p>
      ) : null}

      <ProjectEstimates projectId={project.id} orgId={org.id} userId={user.id} role={role} />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-1">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Links</CardTitle>
              <AddLinkDialog projectId={project.id} />
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <LinkList links={project.links} redirectPath={`/projects/${project.id}`} />
              {canManage ? (
                <ShareLinkCard
                  projectId={project.id}
                  shareUrl={project.shareToken ? `${origin}/share/${project.shareToken}` : null}
                  shareTasks={project.shareTasks}
                />
              ) : null}
            </CardContent>
          </Card>

          <DocumentsCard
            clientId={project.clientId}
            projectId={project.id}
            viewerId={user.id}
            {...(await documentCardData(
              { orgId: org.id, userId: user.id, role },
              { clientId: project.clientId, projectId: project.id }
            ))}
          />

          {agreementsCard.show ? (
            <AgreementsCard
              agreements={agreementsCard.agreements}
              canManage={agreementsCard.canManage}
              showProject={false}
            />
          ) : null}

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base">Team &amp; bill rates</CardTitle>
                {project.confidential ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    This project is confidential — only people listed here (and owners/admins)
                    can see it.
                  </p>
                ) : null}
              </div>
              {canManage && availableMembers.length > 0 ? (
                <AddMemberDialog
                  projectId={project.id}
                  members={availableMembers}
                  currency={org.defaultCurrency}
                  orgDefaultRate={org.defaultBillRate != null ? Number(org.defaultBillRate) : null}
                />
              ) : null}
            </CardHeader>
            <CardContent>
              {project.members.length === 0 ? (
                <EmptyState
                  icon={Users}
                  title="No one assigned yet"
                  description={
                    canManage
                      ? "Add teammates with a bill rate before logging billable time."
                      : "An owner or admin adds teammates and their bill rates."
                  }
                />
              ) : (
                <ul className="flex flex-col divide-y divide-border">
                  {project.members.map((member) => (
                    <li key={member.id} className="flex items-center justify-between gap-2 py-2.5">
                      <div className="text-sm">
                        <div className="flex items-center gap-2">
                          <p className="font-medium">{member.user.name}</p>
                          {member.approvalStatus !== "NOT_REQUIRED" ? (
                            <StatusBadge status={member.approvalStatus} />
                          ) : null}
                        </div>
                        <p className="text-muted-foreground">{member.user.email}</p>
                      </div>
                      <div className="flex items-center gap-1">
                        {/* The client contact is emailed this link when email is
                            configured; otherwise it has to be shared by hand. */}
                        {canManage && member.approvalStatus === "PENDING" && member.approvalToken ? (
                          <CopyButton
                            value={`${origin}/review/${member.approvalToken}`}
                            label="Review link"
                          />
                        ) : null}
                        <span className="tabular-figures text-sm">
                          {formatCurrency(member.billRate, member.currency)}/hr
                        </span>
                        {canManage ? (
                          <>
                            <EditRateDialog
                              projectId={project.id}
                              userId={member.userId}
                              name={member.user.name ?? member.user.email ?? ""}
                              billRate={Number(member.billRate)}
                              currency={member.currency}
                            />
                            <form
                              action={removeProjectMemberAction.bind(null, member.id, project.id)}
                            >
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-7"
                                type="submit"
                                aria-label={`Remove ${member.user.name ?? member.user.email ?? "team member"} from project`}
                                title="Remove from project"
                              >
                                <Trash2 className="size-3.5" />
                              </Button>
                            </form>
                          </>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              {zeroRateMembers.length > 0 ? (
                <p className="mt-3 text-xs text-muted-foreground">
                  {zeroRateMembers.length === 1
                    ? `${zeroRateMembers[0].user.name ?? zeroRateMembers[0].user.email} is`
                    : `${zeroRateMembers.length} people are`}{" "}
                  at {formatCurrency(0, org.defaultCurrency)}/hr, so their billable time here invoices
                  at zero. Click the pencil to set a rate.{" "}
                  {noDefaultRates ? (
                    <>
                      To start people at a real rate on new projects, set a default under{" "}
                      <Link href="/settings" className="text-brand hover:underline">
                        Settings → General
                      </Link>{" "}
                      or per person under{" "}
                      <Link href="/settings/members" className="text-brand hover:underline">
                        Settings → Members
                      </Link>
                      .
                    </>
                  ) : null}
                </p>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Tasks</CardTitle>
              {project.members.length > 0 ? (
                <AddTaskDialog
                  projects={[
                    { id: project.id, label: project.name, members: projectMemberOptions },
                  ]}
                />
              ) : null}
            </CardHeader>
            <CardContent>
              {project.members.length === 0 ? (
                <EmptyState
                  icon={ListTodo}
                  title="Add a team member first"
                  description="Tasks can be assigned once someone is on the project."
                />
              ) : (
                <TaskList
                  projectId={project.id}
                  tasks={taskItems}
                  members={projectMemberOptions}
                  openTaskDetail={openTaskDetail}
                  runningTaskId={activeTimer?.taskId ?? null}
                />
              )}
            </CardContent>
          </Card>

          {linearConnection ? (
            <LinearSyncCard
              projectId={project.id}
              link={
                project.externalLink?.source === "linear"
                  ? {
                      teamId: project.externalLink.externalId,
                      teamName: project.externalLink.externalName,
                      linearProjectId: project.externalLink.linearProjectId,
                      linearProjectName: project.externalLink.linearProjectName,
                      labelIds: project.externalLink.labelIds,
                      labelNames: project.externalLink.labelNames,
                      pushChanges: project.externalLink.pushChanges,
                      lastSyncedAt: project.externalLink.lastSyncedAt?.toISOString() ?? null,
                    }
                  : null
              }
              canManage={canManage}
              connectionCanWrite={canWrite(linearConnection)}
            />
          ) : null}
        </div>

        <div className="flex flex-col gap-4 lg:col-span-2">
          <ProjectBillingCard
            clientId={project.client.id}
            currency={org.defaultCurrency}
            budgetHours={project.budgetHours ? Number(project.budgetHours) : null}
            loggedHours={Number(totalLoggedHours._sum.hours ?? 0)}
            flatFeeAmount={
              project.billingType === "FLAT_FEE" && project.flatFeeAmount
                ? Number(project.flatFeeAmount)
                : null
            }
            invoicedTotal={invoicedTotal}
            invoices={projectInvoices}
          />

          {project.billingType === "MILESTONE" ? (
            <MilestonesCard
              projectId={project.id}
              milestones={milestoneItems}
              currency={org.defaultCurrency}
              canManage={canManage}
            />
          ) : null}

          <ExpensesCard
            projectId={project.id}
            expenses={expenseItems}
            currency={org.defaultCurrency}
            canManage={canManage}
          />

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Recent time entries</CardTitle>
            </CardHeader>
            <CardContent>
              {project.timeEntries.length === 0 ? (
                <p className="text-sm text-muted-foreground">No time logged on this project yet.</p>
              ) : (
                <ul className="flex flex-col divide-y divide-border">
                  {project.timeEntries.map((entry) => (
                    <li key={entry.id} className="flex items-center justify-between gap-2 py-2.5 text-sm">
                      <div>
                        <p>{entry.user.name}</p>
                        <p className="text-muted-foreground">
                          {formatDate(entry.date)}
                          {entry.description ? ` · ${entry.description}` : ""}
                        </p>
                      </div>
                      <span className="tabular-figures">{Number(entry.hours).toFixed(2)}h</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
