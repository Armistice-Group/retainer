import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Download, Landmark, CreditCard } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/status-badge";
import { getProjectByShareToken } from "@/lib/services/project-share";
import { formatCurrency, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { isOverdue, daysOverdue } from "@/lib/invoice-aging";

export const metadata: Metadata = {
  title: "Project report",
  robots: { index: false, follow: false },
};

export default async function SharedProjectPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const report = await getProjectByShareToken(token);
  if (!report) notFound();

  const { project, loggedHours, totalBilled, totalPaid, invoices } = report;
  const org = project.org;
  const logoSrc = org.logoData
    ? `data:${org.logoContentType};base64,${Buffer.from(org.logoData).toString("base64")}`
    : org.logoUrl;
  const paymentInstructions = project.client.paymentInstructions ?? org.paymentInstructions;

  const budgetHours = project.budgetHours != null ? Number(project.budgetHours) : null;
  const budgetPercent =
    budgetHours && budgetHours > 0 ? Math.min(100, (loggedHours / budgetHours) * 100) : null;
  const overBudget = budgetHours != null && loggedHours > budgetHours;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between px-6 py-5">
          {logoSrc ? (
            // eslint-disable-next-line @next/next/no-img-element -- external/data-URI logo, no static import
            <img src={logoSrc} alt={org.name} className="h-8 max-w-[160px] object-contain" />
          ) : (
            <span className="text-lg font-semibold tracking-tight">{org.name}</span>
          )}
          <span className="text-sm text-muted-foreground">Client report</span>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-6 py-10">
        <div>
          <p className="text-sm text-muted-foreground">{project.client.name}</p>
          <div className="mt-1 flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">{project.name}</h1>
            <StatusBadge status={project.status} />
          </div>
          {project.description ? (
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{project.description}</p>
          ) : null}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {budgetHours != null ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Hours</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                <div className="flex items-baseline justify-between text-sm">
                  <span className="tabular-figures font-medium">
                    {loggedHours.toFixed(2)}h{" "}
                    <span className="text-muted-foreground">of {budgetHours.toFixed(2)}h</span>
                  </span>
                  {budgetPercent != null ? (
                    <span
                      className={cn(
                        "tabular-figures text-xs",
                        overBudget ? "text-destructive" : "text-muted-foreground"
                      )}
                    >
                      {Math.round(budgetPercent)}%
                    </span>
                  ) : null}
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all",
                      overBudget ? "bg-destructive" : "bg-primary"
                    )}
                    style={{ width: `${budgetPercent ?? 0}%` }}
                  />
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Hours logged</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="tabular-figures text-2xl font-semibold">{loggedHours.toFixed(2)}h</p>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Billed to date</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-1">
              <p className="tabular-figures text-2xl font-semibold">
                {formatCurrency(totalBilled, "USD")}
              </p>
              <p className="text-xs text-muted-foreground">
                {formatCurrency(totalPaid, "USD")} paid
              </p>
            </CardContent>
          </Card>

          {project.billingType === "FLAT_FEE" && project.flatFeeAmount != null ? (
            <Card className="sm:col-span-2">
              <CardHeader>
                <CardTitle className="text-base">Fixed fee</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="tabular-figures text-2xl font-semibold">
                  {formatCurrency(Number(project.flatFeeAmount), "USD")}
                </p>
              </CardContent>
            </Card>
          ) : null}
        </div>

        {project.billingType === "MILESTONE" && project.milestones.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Milestones</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col divide-y divide-border p-0">
              {project.milestones.map((m) => (
                <div key={m.id} className="flex items-center justify-between gap-4 px-6 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{m.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {m.completedAt ? `Completed ${formatDate(m.completedAt)}` : "In progress"}
                    </p>
                  </div>
                  <span className="tabular-figures shrink-0 text-sm font-medium">
                    {formatCurrency(Number(m.amount), "USD")}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        ) : null}

        {invoices.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Invoices</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col divide-y divide-border p-0">
              {invoices.map((inv) => {
                const canPay =
                  inv.status === "SENT" &&
                  org.plan === "GROWTH" &&
                  (org.stripeConnectChargesEnabled || !!org.mercuryConnection?.destinationAccountId);
                return (
                  <div
                    key={inv.id}
                    className="flex flex-col gap-3 px-6 py-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <a
                      href={`/share/${token}/invoices/${inv.id}/pdf`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex min-w-0 flex-1 items-center justify-between gap-4 hover:underline"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium">{inv.number}</p>
                          <StatusBadge status={inv.status} />
                        </div>
                        <p
                          className={cn(
                            "text-xs",
                            isOverdue(inv.status, inv.dueDate)
                              ? "font-medium text-destructive"
                              : "text-muted-foreground"
                          )}
                        >
                          Issued {formatDate(inv.issueDate)} · Due {formatDate(inv.dueDate)}
                          {isOverdue(inv.status, inv.dueDate)
                            ? ` · ${daysOverdue(inv.dueDate)}d overdue`
                            : ""}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-3">
                        <span className="tabular-figures text-sm font-medium">
                          {formatCurrency(inv.total, inv.currency)}
                        </span>
                        <Download className="size-4 text-muted-foreground" />
                      </div>
                    </a>
                    {canPay ? (
                      <Button size="sm" asChild className="shrink-0">
                        <a href={`/api/share/${token}/invoices/${inv.id}/pay`}>
                          <CreditCard className="size-3.5" /> Pay now
                        </a>
                      </Button>
                    ) : null}
                  </div>
                );
              })}
            </CardContent>
          </Card>
        ) : null}

        {paymentInstructions ? (
          <Card>
            <CardHeader className="flex flex-row items-center gap-2">
              <Landmark className="size-4 text-muted-foreground" />
              <CardTitle className="text-base">Payment details</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="whitespace-pre-line text-sm text-muted-foreground">
                {paymentInstructions}
              </p>
            </CardContent>
          </Card>
        ) : null}

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Shared by {org.name} via Consultainer.
        </p>
      </main>
    </div>
  );
}
