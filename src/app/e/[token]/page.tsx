import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/status-badge";
import { ScopeText } from "@/components/estimates/scope-text";
import { getEstimateByViewToken } from "@/lib/services/estimates";
import { formatCurrency, formatDate } from "@/lib/format";
import { RespondForm } from "./respond-form";

export const metadata: Metadata = {
  title: "Estimate",
  robots: { index: false, follow: false },
};

// The client's view of an estimate, reached by its unguessable link. Shows
// only the estimate itself (no project, team or other client data), with
// Accept / Decline while it's open.
export default async function ClientEstimatePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const estimate = await getEstimateByViewToken(token);
  if (!estimate) notFound();

  const org = estimate.org;
  const logoSrc = org.logoData
    ? `data:${org.logoContentType};base64,${Buffer.from(org.logoData).toString("base64")}`
    : org.logoUrl;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex w-full max-w-4xl items-center justify-between px-4 py-5 sm:px-6">
          {logoSrc ? (
            // eslint-disable-next-line @next/next/no-img-element -- external/data-URI logo
            <img src={logoSrc} alt={org.name} className="h-8 max-w-[160px] object-contain" />
          ) : (
            <span className="text-lg font-semibold tracking-tight">{org.name}</span>
          )}
          <span className="text-sm text-muted-foreground">Estimate {estimate.number}</span>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-4xl flex-col gap-4 px-4 py-8 sm:px-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm text-muted-foreground">
              For {estimate.client.name} · {formatDate(estimate.issueDate)}
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">{estimate.title}</h1>
            <p className="tabular-figures mt-1 text-3xl font-semibold tracking-tight">
              {formatCurrency(estimate.total, estimate.currency)}
            </p>
            <div className="mt-2 flex items-center gap-2 text-sm">
              <StatusBadge status={estimate.status === "SENT" ? "PENDING" : estimate.status} />
              <span className="text-muted-foreground">
                {estimate.status === "ACCEPTED"
                  ? `Accepted${estimate.responderName ? ` by ${estimate.responderName}` : ""}${estimate.respondedAt ? ` on ${formatDate(estimate.respondedAt)}` : ""}.`
                  : estimate.status === "DECLINED"
                    ? "This estimate was declined."
                    : estimate.status === "EXPIRED"
                      ? `This estimate expired after ${formatDate(estimate.expiresAt!)}. Ask ${org.name} for an updated one.`
                      : estimate.expiresAt
                        ? `Valid until ${formatDate(estimate.expiresAt)}`
                        : null}
              </span>
            </div>
          </div>
          <Button variant="outline" asChild>
            <a href={`/e/${token}/pdf?download=1`}>
              <Download /> Download PDF
            </a>
          </Button>
        </div>

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
            <CardTitle className="text-base">Pricing</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            {estimate.lineItems.map((line) => (
              <div key={line.id} className="flex justify-between gap-4 border-b border-border pb-2">
                <span>
                  {line.description}
                  <span className="ml-2 text-xs text-muted-foreground">
                    {Number(line.quantity)} × {formatCurrency(line.rate, estimate.currency)}
                    {line.isMilestone ? " · Milestone" : ""}
                  </span>
                </span>
                <span className="tabular-figures shrink-0">{formatCurrency(line.amount, estimate.currency)}</span>
              </div>
            ))}
            <div className="flex justify-between gap-4 pt-1 text-muted-foreground">
              <span>Subtotal</span>
              <span className="tabular-figures">{formatCurrency(estimate.subtotal, estimate.currency)}</span>
            </div>
            {Number(estimate.taxRate) > 0 ? (
              <div className="flex justify-between gap-4 text-muted-foreground">
                <span>Tax ({estimate.taxRate.toString()}%)</span>
                <span className="tabular-figures">{formatCurrency(estimate.taxAmount, estimate.currency)}</span>
              </div>
            ) : null}
            <div className="flex justify-between gap-4 text-base font-semibold">
              <span>Total</span>
              <span className="tabular-figures">{formatCurrency(estimate.total, estimate.currency)}</span>
            </div>
          </CardContent>
        </Card>

        {estimate.status === "SENT" ? (
          <Card>
            <CardContent>
              <RespondForm token={token} orgName={org.name} />
            </CardContent>
          </Card>
        ) : null}
      </main>
    </div>
  );
}
