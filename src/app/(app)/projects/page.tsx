import Link from "next/link";
import { Building2, ChevronRight, FolderKanban, Plus, Lock } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireOrgContext } from "@/lib/org-context";
import { projectVisibilityWhere } from "@/lib/project-access";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/empty-state";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default async function ProjectsPage() {
  const { org, user, role } = await requireOrgContext();

  const projects = await prisma.project.findMany({
    where: { orgId: org.id, ...projectVisibilityWhere(user.id, role) },
    include: { client: true, _count: { select: { members: true } } },
    orderBy: [{ client: { name: "asc" } }, { createdAt: "desc" }],
  });

  const groups = new Map<string, { client: (typeof projects)[number]["client"]; projects: typeof projects }>();
  for (const project of projects) {
    const existing = groups.get(project.clientId);
    if (existing) {
      existing.projects.push(project);
    } else {
      groups.set(project.clientId, { client: project.client, projects: [project] });
    }
  }

  return (
    <div>
      <PageHeader
        title="Projects"
        description="Work in flight, organized by client."
        actions={
          <Button asChild>
            <Link href="/projects/new">
              <Plus className="size-4" /> New project
            </Link>
          </Button>
        }
      />

      {projects.length === 0 ? (
        <EmptyState
          icon={FolderKanban}
          title="No projects yet"
          description="Create a project under a client to start tracking time and billing."
          action={
            <Button asChild size="sm">
              <Link href="/projects/new">
                <Plus className="size-4" /> New project
              </Link>
            </Button>
          }
        />
      ) : (
        <div className="flex flex-col gap-8">
          {[...groups.values()].map(({ client, projects: clientProjects }) => (
            <div key={client.id}>
              <Link
                href={`/clients/${client.id}`}
                className="mb-3 flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"
              >
                <Building2 className="size-4" />
                {client.name}
                <ChevronRight className="size-3.5" />
              </Link>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {clientProjects.map((project) => (
                  <Link key={project.id} href={`/projects/${project.id}`}>
                    <Card className="h-full gap-2 p-5 transition-colors hover:border-primary/40">
                      <div className="flex items-start justify-between gap-2">
                        <p className="flex items-center gap-1.5 font-medium">
                          {project.confidential ? (
                            <Lock className="size-3.5 shrink-0 text-chart-4" />
                          ) : null}
                          {project.name}
                        </p>
                        <StatusBadge status={project.status} />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {project._count.members} team member{project._count.members === 1 ? "" : "s"}
                      </p>
                    </Card>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
