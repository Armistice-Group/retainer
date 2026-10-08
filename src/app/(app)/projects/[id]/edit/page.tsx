import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireOrgContext } from "@/lib/org-context";
import { canViewProject } from "@/lib/project-access";
import { ProjectForm } from "../../project-form";
import { updateProjectAction } from "@/actions/projects";
import { PageHeader } from "@/components/layout/page-header";

export default async function EditProjectPage({ params }: { params: Promise<{ id: string }> }) {
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

  const boundAction = updateProjectAction.bind(null, id);

  return (
    <div className="mx-auto w-full max-w-5xl">
      <PageHeader title={`Edit ${project.name}`} />
      <ProjectForm
        action={boundAction}
        clients={clients}
        submitLabel="Save changes"
        cancelHref={`/projects/${id}`}
        initialValues={{
          clientId: project.clientId,
          name: project.name,
          description: project.description,
          status: project.status,
          startDate: project.startDate,
          endDate: project.endDate,
          confidential: project.confidential,
          budgetHours: project.budgetHours ? Number(project.budgetHours) : null,
          billingType: project.billingType,
          flatFeeAmount: project.flatFeeAmount ? Number(project.flatFeeAmount) : null,
        }}
      />
    </div>
  );
}
