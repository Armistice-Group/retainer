import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireOrgContext } from "@/lib/org-context";
import { PageHeader } from "@/components/layout/page-header";
import { canManageEstimates, estimateVisibilityWhere } from "@/lib/services/estimates";
import { toISODate } from "@/lib/date";
import { EstimateForm } from "../../estimate-form";
import { estimateFormOptions } from "../../form-options";

export default async function EditEstimatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { org, user, role } = await requireOrgContext();
  if (!canManageEstimates(role)) notFound();

  const estimate = await prisma.estimate.findFirst({
    where: { id, orgId: org.id, ...estimateVisibilityWhere(user.id, role) },
    include: { lineItems: { orderBy: { sortOrder: "asc" } } },
  });
  if (!estimate) notFound();
  if (estimate.status !== "DRAFT") redirect(`/estimates/${estimate.id}`);

  const { clients, projects } = await estimateFormOptions(org.id, user.id, role);

  return (
    <div className="max-w-4xl">
      <PageHeader title={`Edit ${estimate.number}`} description="Only drafts can be edited." />
      <EstimateForm
        estimateId={estimate.id}
        clients={clients}
        projects={projects}
        currency={estimate.currency}
        initial={{
          clientId: estimate.clientId,
          projectId: estimate.projectId ?? "",
          title: estimate.title,
          intro: estimate.intro ?? "",
          issueDate: toISODate(estimate.issueDate),
          expiresAt: estimate.expiresAt ? toISODate(estimate.expiresAt) : "",
          taxRate: estimate.taxRate.toString(),
          proposedBillingType: estimate.proposedBillingType ?? "",
          proposedRate: estimate.proposedRate?.toString() ?? "",
          proposedBudget: estimate.proposedBudget?.toString() ?? "",
          lineItems: estimate.lineItems.map((l) => ({
            description: l.description,
            quantity: l.quantity.toString(),
            rate: l.rate.toString(),
            isMilestone: l.isMilestone,
            dueMode: l.milestoneDueDate ? "date" : l.milestoneDueDays != null ? "days" : "none",
            milestoneDueDate: l.milestoneDueDate ? toISODate(l.milestoneDueDate) : "",
            milestoneDueDays: l.milestoneDueDays != null ? String(l.milestoneDueDays) : "",
          })),
        }}
      />
    </div>
  );
}
