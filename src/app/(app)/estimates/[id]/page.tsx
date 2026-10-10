import Link from "next/link";
import { notFound } from "next/navigation";
import { Copy, Download, FolderPlus, Pencil, Trash2 } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireOrgContext } from "@/lib/org-context";
import { PageHeader } from "@/components/layout/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ConfirmSubmitButton } from "@/components/forms/confirm-submit-button";
import { ScopeText } from "@/components/estimates/scope-text";
import { formatCurrency, formatDate } from "@/lib/format";
import { isEmailConfigured } from "@/lib/email";
import {
  canManageEstimates,
  defaultEstimateRecipients,
  estimateContactOptions,
  estimateVisibilityWhere,
  expireEstimates,
  projectPlanFor,
} from "@/lib/services/estimates";
import {
  createProjectFromEstimateAction,
  deleteEstimateAction,
  duplicateEstimateAction,
} from "@/actions/estimates";
import { CopyEstimateLinkButton, EmailEstimateDialog, MarkResponseDialog } from "./estimate-actions";

const BILLING_LABELS: Record<string, string> = {
  HOURLY: "Hourly",
  FLAT_FEE: "Flat fee",
  MILESTONE: "Milestone-based",
};

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right">{children}</span>
    </div>
  );
}

export default async function EstimateDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { org, user, role } = await requireOrgContext();
  await expireEstimates({ orgId: org.id, estimateId: id });

  const estimate = await prisma.estimate.findFirst({
    where: { id, orgId: org.id, ...estimateVisibilityWhere(user.id, role) },
    include: {
      client: { select: { id: true, name: true } },
      project: { select: { id: true, name: true } },
      respondedBy: { select: { name: true } },
      lineItems: { orderBy: { sortOrder: "asc" } },
    },
  });
  if (!estimate) notFound();

  const canManage = canManageEstimates(role);
  const isDraft = estimate.status === "DRAFT";
  const sendable = isDraft || estimate.status === "SENT";
  const [emailConfigured, contacts, defaultRecipients] = canManage && sendable
    ? await Promise.all([
        isEmailConfigured(),
        estimateContactOptions(estimate.clientId),
        defaultEstimateRecipients(estimate.clientId),
      ])
    : [false, [], []];
  const plan = projectPlanFor(estimate);
  const responded = estimate.status === "ACCEPTED" || estimate.status === "DECLINED";

  return (
    <div>
      <PageHeader
        title={`${estimate.number} · ${estimate.title}`}
        description={
          <Link href={`/clients/${estimate.client.id}`} className="hover:underline">
            {estimate.client.name}
          </Link>
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" asChild>
              <a href={`/estimates/${estimate.id}/pdf?download=1`}>
                <Download className="size-3.5" /> PDF
              </a>
            </Button>
            {canManage && isDraft ? (
              <Button variant="outline" size="sm" asChild>
                <Link href={`/estimates/${estimate.id}/edit`}>
                  <Pencil className="size-3.5" /> Edit
                </Link>
              </Button>
            ) : null}
            {canManage && sendable ? (
              <>
                <EmailEstimateDialog
                  estimateId={estimate.id}
                  estimateNumber={estimate.number}
                  contacts={contacts}
                  defaultRecipients={defaultRecipients}
                  isDraft={isDraft}
                  emailConfigured={emailConfigured}
                />
                <CopyEstimateLinkButton estimateId={estimate.id} isDraft={isDraft} />
              </>
            ) : null}
            {canManage && !responded ? (
              <>
                <MarkResponseDialog estimateId={estimate.id} decision="ACCEPTED" />
                <MarkResponseDialog estimateId={estimate.id} decision="DECLINED" />
              </>
            ) : null}
            {canManage ? (
              <form action={duplicateEstimateAction.bind(null, estimate.id)}>
                <Button variant="outline" size="sm" type="submit">
                  <Copy className="size-3.5" /> Duplicate
                </Button>
              </form>
            ) : null}
            {canManage && isDraft ? (
              <form action={deleteEstimateAction.bind(null, estimate.id)}>
                <ConfirmSubmitButton
                  variant="outline"
                  size="sm"
                  confirmMessage="Delete this draft estimate? This can't be undone."
                >
                  <Trash2 className="size-3.5" /> Delete
                </ConfirmSubmitButton>
              </form>
            ) : null}
          </div>
        }
      />

      <div className="mb-6 flex flex-wrap items-center gap-2 text-sm">
        <StatusBadge status={estimate.status} />
        <span className="text-muted-foreground">
          {estimate.status === "EXPIRED"
            ? `Expired after ${formatDate(estimate.expiresAt!)}. Duplicate it to send a fresh copy.`
            : estimate.expiresAt
              ? `Valid until ${formatDate(estimate.expiresAt)}`
              : "No expiry"}
        </span>
      </div>

      {estimate.status === "ACCEPTED" && canManage && !estimate.projectId ? (
        <Card className="mb-4 border-chart-3/40">
          <CardContent className="flex flex-wrap items-center justify-between gap-4">
            <p className="text-sm">
              Accepted. Create the project: <strong>{estimate.title}</strong>, {BILLING_LABELS[plan.billingType].toLowerCase()}
              {plan.flatFeeAmount ? `, fee ${formatCurrency(plan.flatFeeAmount, estimate.currency)}` : ""}
              {plan.budgetHours ? `, ${plan.budgetHours} budget hours` : ""}
              {plan.createsMilestones
                ? `, ${estimate.lineItems.filter((l) => l.isMilestone).length} milestones`
                : ""}
              .
            </p>
            <form action={createProjectFromEstimateAction.bind(null, estimate.id)}>
              <ConfirmSubmitButton size="sm" confirmMessage={`Create the project "${estimate.title}" from this estimate?`}>
                <FolderPlus className="size-3.5" /> Create project
              </ConfirmSubmitButton>
            </form>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
          {estimate.intro ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Scope</CardTitle>
              </CardHeader>
              <CardContent>
                <ScopeText text={estimate.intro} />
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Line items</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Description</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Unit price</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {estimate.lineItems.map((line) => (
                    <TableRow key={line.id}>
                      <TableCell className="whitespace-normal">
                        {line.description}
                        {line.isMilestone ? (
                          <span className="ml-2 text-xs text-muted-foreground">
                            Milestone
                            {line.milestoneDueDate
                              ? `, due ${formatDate(line.milestoneDueDate)}`
                              : line.milestoneDueDays != null
                                ? `, due ${line.milestoneDueDays} days after acceptance`
                                : ""}
                          </span>
                        ) : null}
                      </TableCell>
                      <TableCell className="tabular-figures text-right">{Number(line.quantity)}</TableCell>
                      <TableCell className="tabular-figures text-right">
                        {formatCurrency(line.rate, estimate.currency)}
                      </TableCell>
                      <TableCell className="tabular-figures text-right">
                        {formatCurrency(line.amount, estimate.currency)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card className="gap-0 overflow-hidden p-0">
            <details>
              <summary className="cursor-pointer px-6 py-4 text-base font-medium select-none">
                Preview PDF
              </summary>
              <iframe
                src={`/estimates/${estimate.id}/pdf`}
                title={`Estimate ${estimate.number} PDF`}
                loading="lazy"
                className="h-[75vh] min-h-[480px] w-full border-t border-border bg-muted"
              />
            </details>
          </Card>
        </div>

        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Summary</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              <Row label="Date">{formatDate(estimate.issueDate)}</Row>
              <Row label="Subtotal">
                <span className="tabular-figures">{formatCurrency(estimate.subtotal, estimate.currency)}</span>
              </Row>
              {Number(estimate.taxRate) > 0 ? (
                <Row label={`Tax (${estimate.taxRate.toString()}%)`}>
                  <span className="tabular-figures">{formatCurrency(estimate.taxAmount, estimate.currency)}</span>
                </Row>
              ) : null}
              <div className="flex justify-between border-t border-border pt-2 text-base font-semibold">
                <span>Total</span>
                <span className="tabular-figures">{formatCurrency(estimate.total, estimate.currency)}</span>
              </div>
              {estimate.sentAt ? <Row label="Sent">{formatDate(estimate.sentAt)}</Row> : null}
            </CardContent>
          </Card>

          {responded ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  {estimate.status === "ACCEPTED" ? "Acceptance" : "Declined"}
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                {estimate.responderName ? <Row label="By">{estimate.responderName}</Row> : null}
                {estimate.respondedAt ? (
                  <Row label="When">{estimate.respondedAt.toISOString().replace("T", " ").slice(0, 16)} UTC</Row>
                ) : null}
                {estimate.respondedBy ? (
                  <Row label="Marked by">{estimate.respondedBy.name}</Row>
                ) : (
                  <Row label="How">On the client page</Row>
                )}
                {estimate.responseIp ? <Row label="IP address">{estimate.responseIp}</Row> : null}
                {estimate.responseUserAgent ? (
                  <p className="break-words text-xs text-muted-foreground">{estimate.responseUserAgent}</p>
                ) : null}
                {estimate.responseNote ? (
                  <p className="border-t border-border pt-2 text-sm whitespace-pre-wrap">{estimate.responseNote}</p>
                ) : null}
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Project</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {estimate.project ? (
                <>
                  <Link href={`/projects/${estimate.project.id}`} className="text-sm text-brand hover:underline">
                    {estimate.project.name}
                  </Link>
                  <p className="text-xs text-muted-foreground">
                    {estimate.projectCreatedAt
                      ? `Created from this estimate on ${formatDate(estimate.projectCreatedAt)}.`
                      : "This estimate is for this existing project."}
                  </p>
                </>
              ) : (
                <>
                  <Row label="Billing type">
                    {BILLING_LABELS[plan.billingType]}
                    {estimate.proposedBillingType ? "" : " (automatic)"}
                  </Row>
                  <Row label="Budget">{formatCurrency(plan.budget, estimate.currency)}</Row>
                  {plan.rate != null ? (
                    <Row label="Hourly rate">{formatCurrency(plan.rate, estimate.currency)}</Row>
                  ) : null}
                  <p className="text-xs text-muted-foreground">
                    {estimate.status === "ACCEPTED"
                      ? "Not created yet."
                      : "What the project gets if you create one once this is accepted."}
                  </p>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
