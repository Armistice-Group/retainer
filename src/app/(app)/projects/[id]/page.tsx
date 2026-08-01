import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil, Trash2, Users, ListTodo } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireOrgContext } from "@/lib/org-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/status-badge";
import { PageHeader } from "@/components/layout/page-header";
import { LinkList } from "@/components/link-list";
import { AddLinkDialog } from "@/components/forms/add-link-dialog";
import { AddMemberDialog } from "./add-member-dialog";
import { AddTaskDialog } from "./add-task-dialog";
import { TaskList } from "./task-list";
import { deleteProjectAction, removeProjectMemberAction } from "@/actions/projects";
import { ConfirmSubmitButton } from "@/components/forms/confirm-submit-button";
import { EmptyState } from "@/components/empty-state";
import { formatCurrency, formatDate } from "@/lib/format";
import { CodeHealthCard } from "./code-health-card";
import type { Finding } from "@/lib/codeHealth/checks";

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { org, role } = await requireOrgContext();
  const canManage = role === "OWNER" || role === "ADMIN";

  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      client: true,
      links: { orderBy: { createdAt: "asc" } },
      members: { include: { user: true }, orderBy: { createdAt: "asc" } },
      tasks: { include: { assignee: true }, orderBy: { createdAt: "desc" } },
      timeEntries: {
        include: { user: true },
        orderBy: { date: "desc" },
        take: 8,
      },
      repo: {
        include: {
          scans: { orderBy: { createdAt: "desc" }, take: 1 },
        },
      },
    },
  });

  if (!project || project.orgId !== org.id) notFound();

  const orgMembers = await prisma.membership.findMany({
    where: { orgId: org.id },
    include: { user: true },
  });
  const availableMembers = orgMembers
    .filter((m) => !project.members.some((pm) => pm.userId === m.userId))
    .map((m) => ({ id: m.user.id, name: m.user.name, email: m.user.email }));
  const projectMemberOptions = project.members.map((m) => ({
    id: m.user.id,
    name: m.user.name,
  }));
  const latestScan = project.repo?.scans[0]
    ? {
        score: project.repo.scans[0].score,
        findings: project.repo.scans[0].findings as unknown as Finding[],
        createdAt: project.repo.scans[0].createdAt.toISOString(),
      }
    : null;

  const taskItems = project.tasks.map((t) => ({
    id: t.id,
    title: t.title,
    status: t.status,
    assigneeId: t.assigneeId,
    assigneeName: t.assignee?.name ?? null,
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
            <form action={deleteProjectAction.bind(null, project.id, project.clientId)}>
              <ConfirmSubmitButton
                variant="outline"
                size="sm"
                confirmMessage={`Delete ${project.name}? This also removes its time entries.`}
              >
                <Trash2 className="size-3.5" /> Delete
              </ConfirmSubmitButton>
            </form>
          </>
        }
      />

      <div className="mb-4">
        <StatusBadge status={project.status} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-1">
          {project.description ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Description</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{project.description}</p>
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Links</CardTitle>
              <AddLinkDialog projectId={project.id} />
            </CardHeader>
            <CardContent>
              <LinkList links={project.links} redirectPath={`/projects/${project.id}`} />
            </CardContent>
          </Card>

          <CodeHealthCard
            projectId={project.id}
            repo={project.repo ? { githubOwner: project.repo.githubOwner, githubName: project.repo.githubName } : null}
            latestScan={latestScan}
            gateEnabled={project.codeHealthGateEnabled}
            canManage={canManage}
          />
        </div>

        <div className="flex flex-col gap-4 lg:col-span-2">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Team &amp; bill rates</CardTitle>
              {availableMembers.length > 0 ? (
                <AddMemberDialog
                  projectId={project.id}
                  members={availableMembers}
                  currency={org.defaultCurrency}
                />
              ) : null}
            </CardHeader>
            <CardContent>
              {project.members.length === 0 ? (
                <EmptyState
                  icon={Users}
                  title="No one assigned yet"
                  description="Add teammates with a bill rate before logging billable time."
                />
              ) : (
                <ul className="flex flex-col divide-y divide-border">
                  {project.members.map((member) => (
                    <li key={member.id} className="flex items-center justify-between gap-2 py-2.5">
                      <div className="text-sm">
                        <p className="font-medium">{member.user.name}</p>
                        <p className="text-muted-foreground">{member.user.email}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="tabular-figures text-sm">
                          {formatCurrency(member.billRate, member.currency)}/hr
                        </span>
                        <form action={removeProjectMemberAction.bind(null, member.id, project.id)}>
                          <Button variant="ghost" size="icon" className="size-7" type="submit">
                            <Trash2 className="size-3.5" />
                          </Button>
                        </form>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Tasks</CardTitle>
              {project.members.length > 0 ? (
                <AddTaskDialog projectId={project.id} members={projectMemberOptions} />
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
                />
              )}
            </CardContent>
          </Card>

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
