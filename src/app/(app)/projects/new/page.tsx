import { prisma } from "@/lib/prisma";
import { requireOrgContext } from "@/lib/org-context";
import { ProjectForm } from "../project-form";
import { createProjectAction } from "@/actions/projects";
import { PageHeader } from "@/components/layout/page-header";
import { paymentTermsLabel } from "@/lib/payment-terms";

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
    select: { id: true, name: true, paymentTerms: true },
  });

  return (
    <div className="mx-auto w-full max-w-5xl">
      <PageHeader
        title="Start a project"
        description="Projects live under a client and track their own time and rates."
      />
      <ProjectForm
        action={createProjectAction}
        clients={clients.map((c) => ({
          id: c.id,
          name: c.name,
          paymentTermsLabel: paymentTermsLabel(c.paymentTerms ?? org.defaultPaymentTerms),
        }))}
        defaultClientId={clientId}
        submitLabel="Create project"
        cancelHref={clientId ? `/clients/${clientId}` : "/projects"}
      />
    </div>
  );
}
