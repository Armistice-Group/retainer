import { notFound } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { prisma } from "@/lib/prisma";
import { requireOrgContext } from "@/lib/org-context";
import { canViewProject } from "@/lib/project-access";
import { ProjectForm } from "../../project-form";
import { updateProjectAction } from "@/actions/projects";
import { PageHeader } from "@/components/layout/page-header";
import type { ActionState } from "@/actions/auth";

export default async function EditProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { org, user, role } = await requireOrgContext();

  const [project, clients] = await Promise.all([
    prisma.project.findUnique({ where: { id } }),
    prisma.client.findMany({
      where: { orgId: org.id },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  if (!project || project.orgId !== org.id) notFound();
  if (!(await canViewProject(project, user.id, role))) notFound();

  const boundAction = async (prevState: ActionState, formData: FormData) =>
    updateProjectAction(id, prevState, formData);

  return (
    <div>
      <PageHeader title={`Edit ${project.name}`} />
      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle className="text-base">Project details</CardTitle>
        </CardHeader>
        <CardContent>
          <ProjectForm
            action={boundAction}
            clients={clients}
            submitLabel="Save changes"
            initialValues={{
              clientId: project.clientId,
              name: project.name,
              description: project.description,
              status: project.status,
              startDate: project.startDate,
              endDate: project.endDate,
              confidential: project.confidential,
              budgetHours: project.budgetHours ? Number(project.budgetHours) : null,
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
