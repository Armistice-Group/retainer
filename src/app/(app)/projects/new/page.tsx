import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { prisma } from "@/lib/prisma";
import { requireOrgContext } from "@/lib/org-context";
import { ProjectForm } from "../project-form";
import { createProjectAction } from "@/actions/projects";
import { PageHeader } from "@/components/layout/page-header";

export default async function NewProjectPage({
  searchParams,
}: {
  searchParams: Promise<{ clientId?: string }>;
}) {
  const { org } = await requireOrgContext();
  const { clientId } = await searchParams;

  const clients = await prisma.client.findMany({
    where: { orgId: org.id },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  return (
    <div>
      <PageHeader title="Start a project" description="Projects live under a client and track their own time and rates." />
      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle className="text-base">Project details</CardTitle>
        </CardHeader>
        <CardContent>
          <ProjectForm
            action={createProjectAction}
            clients={clients}
            defaultClientId={clientId}
            submitLabel="Create project"
          />
        </CardContent>
      </Card>
    </div>
  );
}
