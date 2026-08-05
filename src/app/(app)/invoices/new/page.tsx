import { prisma } from "@/lib/prisma";
import { requireOrgContext } from "@/lib/org-context";
import { projectVisibilityWhere } from "@/lib/project-access";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/empty-state";
import { Card } from "@/components/ui/card";
import { FileText } from "lucide-react";
import { ClientPicker } from "./client-picker";
import { InvoiceEntrySelector } from "./invoice-entry-selector";
import { toISODate } from "@/lib/date";

export default async function NewInvoicePage({
  searchParams,
}: {
  searchParams: Promise<{ clientId?: string }>;
}) {
  const { org, user, role } = await requireOrgContext();
  const { clientId } = await searchParams;

  const clients = await prisma.client.findMany({
    where: { orgId: org.id },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  let eligibleSection: React.ReactNode = null;

  if (clientId) {
    const client = clients.find((c) => c.id === clientId);
    if (client) {
      const entries = await prisma.timeEntry.findMany({
        where: {
          orgId: org.id,
          billable: true,
          invoiceLineItemId: null,
          project: { clientId, ...projectVisibilityWhere(user.id, role) },
        },
        include: { project: true, user: true },
        orderBy: { date: "asc" },
      });

      const projectMembers = await prisma.projectMember.findMany({
        where: { projectId: { in: [...new Set(entries.map((e) => e.projectId))] } },
      });
      const rateFor = (projectId: string, userId: string) =>
        Number(
          projectMembers.find((pm) => pm.projectId === projectId && pm.userId === userId)
            ?.billRate ?? 0
        );

      const eligible = entries.map((entry) => {
        const rate =
          entry.rateOverride != null
            ? Number(entry.rateOverride)
            : rateFor(entry.projectId, entry.userId);
        const hours = Number(entry.hours);
        return {
          id: entry.id,
          date: toISODate(new Date(entry.date)),
          hours,
          description: entry.description,
          projectName: entry.project.name,
          userName: entry.user.name,
          rate,
          amount: Math.round(hours * rate * 100) / 100,
        };
      });

      const eligibleMilestones = await prisma.milestone.findMany({
        where: {
          invoiceLineItemId: null,
          completedAt: { not: null },
          project: { clientId, orgId: org.id, ...projectVisibilityWhere(user.id, role) },
        },
        include: { project: true },
        orderBy: { completedAt: "asc" },
      });

      const milestones = eligibleMilestones.map((m) => ({
        id: m.id,
        name: m.name,
        projectName: m.project.name,
        amount: Number(m.amount),
        completedAt: m.completedAt ? toISODate(new Date(m.completedAt)) : "",
      }));

      const eligibleExpenses = await prisma.expense.findMany({
        where: {
          invoiceLineItemId: null,
          status: "APPROVED",
          project: { clientId, orgId: org.id, ...projectVisibilityWhere(user.id, role) },
        },
        include: { project: true },
        orderBy: { incurredAt: "asc" },
      });

      const expenses = eligibleExpenses.map((e) => ({
        id: e.id,
        description: e.description,
        projectName: e.project.name,
        amount: Number(e.amount),
        incurredAt: toISODate(new Date(e.incurredAt)),
      }));

      eligibleSection =
        eligible.length === 0 && milestones.length === 0 && expenses.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="Nothing to invoice"
            description="This client has no unbilled, billable time entries, completed milestones, or approved expenses yet."
          />
        ) : (
          <InvoiceEntrySelector
            clientId={client.id}
            entries={eligible}
            milestones={milestones}
            expenses={expenses}
            currency={org.defaultCurrency}
            defaultTaxRate={Number(org.defaultTaxRate)}
          />
        );
    }
  }

  return (
    <div>
      <PageHeader
        title="New invoice"
        description="Pick a client, then select the unbilled time, milestones, and expenses to include."
      />

      <Card className="mb-6 p-5">
        <label className="mb-2 block text-sm font-medium">Client</label>
        <ClientPicker clients={clients} defaultClientId={clientId} />
      </Card>

      {eligibleSection}
    </div>
  );
}
