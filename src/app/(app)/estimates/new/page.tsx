import { notFound } from "next/navigation";
import { requireOrgContext } from "@/lib/org-context";
import { PageHeader } from "@/components/layout/page-header";
import { canManageEstimates } from "@/lib/services/estimates";
import { toISODate } from "@/lib/date";
import { EstimateForm, emptyLine } from "../estimate-form";
import { estimateFormOptions } from "../form-options";

export default async function NewEstimatePage({
  searchParams,
}: {
  searchParams: Promise<{ clientId?: string; projectId?: string }>;
}) {
  const { org, user, role } = await requireOrgContext();
  if (!canManageEstimates(role)) notFound();
  const { clientId, projectId } = await searchParams;
  const { clients, projects } = await estimateFormOptions(org.id, user.id, role);

  const client = clients.find((c) => c.id === clientId);
  const project = projects.find((p) => p.id === projectId && (!client || p.clientId === client.id));
  const today = new Date();
  const in30 = new Date(today.getTime() + 30 * 86_400_000);

  return (
    <div className="max-w-4xl">
      <PageHeader
        title="New estimate"
        description="Line items, scope and expiry. It's saved as a draft; you send it from the next page."
      />
      <EstimateForm
        estimateId={null}
        clients={clients}
        projects={projects}
        currency={org.defaultCurrency}
        initial={{
          clientId: project?.clientId ?? client?.id ?? "",
          projectId: project?.id ?? "",
          title: "",
          intro: "",
          issueDate: toISODate(today),
          expiresAt: toISODate(in30),
          taxRate: org.defaultTaxRate.toString(),
          proposedBillingType: "",
          proposedRate: "",
          proposedBudget: "",
          lineItems: [{ ...emptyLine }],
        }}
      />
    </div>
  );
}
