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
import { Input } from "@/components/ui/input";

const BILLING_LABELS = { HOURLY: "Hourly", FLAT_FEE: "Flat fee", MILESTONE: "Milestones" } as const;

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string }>;
}) {
  const { org, user, role } = await requireOrgContext();
  const { q: rawQuery, status: rawStatus } = await searchParams;
  const query = rawQuery?.trim().slice(0, 100) ?? "";
  // In flight (active or on hold) unless asked otherwise.
  const statusFilter = rawStatus === "done" || rawStatus === "all" ? rawStatus : "open";
  const filtering = query !== "" || statusFilter !== "open";

  const projects = await prisma.project.findMany({
    where: {
      orgId: org.id,
      ...projectVisibilityWhere(user.id, role),
      ...(statusFilter === "all"
        ? {}
        : { status: { in: statusFilter === "open" ? ["ACTIVE", "ON_HOLD"] : ["COMPLETED", "ARCHIVED"] } }),
      ...(query
        ? {
            AND: [
              {
                OR: [
                  { name: { contains: query, mode: "insensitive" } },
                  { client: { name: { contains: query, mode: "insensitive" } } },
                ],
              },
            ],
          }
        : {}),
    },
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

      {projects.length > 0 || filtering ? (
        <form method="get" className="mb-4 flex flex-wrap items-center gap-2">
          <Input
            name="q"
            type="search"
            defaultValue={query}
            placeholder="Search projects or clients"
            aria-label="Search projects"
            className="h-9 w-full sm:w-64"
          />
          <select
            name="status"
            defaultValue={statusFilter}
            aria-label="Status"
            className="h-9 rounded-md border border-input bg-transparent px-2.5 text-sm"
          >
            <option value="open">Active and on hold</option>
            <option value="done">Completed and archived</option>
            <option value="all">All</option>
          </select>
          <Button type="submit" variant="outline" size="sm">
            Filter
          </Button>
          {filtering ? (
            <Button variant="ghost" size="sm" asChild>
              <Link href="/projects">Clear</Link>
            </Button>
          ) : null}
        </form>
      ) : null}

      {projects.length === 0 && filtering ? (
        <EmptyState
          icon={FolderKanban}
          title="No projects match"
          description={query ? `Nothing matches “${query}”.` : "No projects with that status."}
          action={
            <Button asChild size="sm" variant="outline">
              <Link href="/projects">Show active projects</Link>
            </Button>
          }
        />
      ) : projects.length === 0 ? (
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
                    <Card className="h-full gap-2 p-5 transition-colors hover:border-foreground/20">
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
                        {BILLING_LABELS[project.billingType]} · {project._count.members}{" "}
                        {project._count.members === 1 ? "person" : "people"}
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
