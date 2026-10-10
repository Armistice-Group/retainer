import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Download, Landmark, CreditCard } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/status-badge";
import { getClientByShareToken } from "@/lib/services/client-share";
import { formatCurrency, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { isOverdue, daysOverdue } from "@/lib/invoice-aging";
import { effectivePaymentMethods } from "@/lib/services/payment-methods";
import { PaymentMethodsList } from "@/components/payment-methods-list";
import { isPaymentProcessing, PaymentReturnBanner } from "@/components/payment-return-banner";
import { SharedDocuments } from "@/components/documents/shared-documents";
import { clientVisibleDocuments } from "@/lib/services/documents";

export const metadata: Metadata = {
  title: "Client report",
  robots: { index: false, follow: false },
};

export default async function SharedClientPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ paid?: string; reason?: string; invoice?: string }>;
}) {
  const { token } = await params;
  const { paid, reason, invoice: returnedInvoiceId } = await searchParams;
  const report = await getClientByShareToken(token);
  if (!report) notFound();

  const { client, projects, loggedHours, totalBilled, totalPaid, invoices } = report;
  const org = client.org;
  const logoSrc = org.logoData
    ? `data:${org.logoContentType};base64,${Buffer.from(org.logoData).toString("base64")}`
    : org.logoUrl;
  const paymentMethods = await effectivePaymentMethods(org.id, client.id);
  // Back from "Pay now" for one of the invoices listed below.
  const returned = invoices.find((inv) => inv.id === returnedInvoiceId);

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
        {returned ? (
          <PaymentReturnBanner
            paid={paid}
            reason={reason}
            invoice={{ number: returned.number, status: returned.status, processing: isPaymentProcessing(returned) }}
            orgName={org.name}
            hasPaymentMethods={paymentMethods.length > 0}
          />
        ) : null}

        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{client.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {projects.length} active project{projects.length === 1 ? "" : "s"}
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Hours logged</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="tabular-figures text-2xl font-semibold">{loggedHours.toFixed(2)}h</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Billed to date</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-1">
              <p className="tabular-figures text-2xl font-semibold">
                {formatCurrency(totalBilled, org.defaultCurrency)}
              </p>
              <p className="text-xs text-muted-foreground">
                {formatCurrency(totalPaid, org.defaultCurrency)} paid
              </p>
            </CardContent>
          </Card>
        </div>

        {projects.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Projects</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col divide-y divide-border p-0">
              {projects.map((p) => (
                <div key={p.id} className="flex items-center justify-between gap-4 px-6 py-3">
                  <p className="truncate text-sm font-medium">{p.name}</p>
                  <StatusBadge status={p.status} />
                </div>
              ))}
            </CardContent>
          </Card>
        ) : null}

        <SharedDocuments
          documents={await clientVisibleDocuments({ clientId: client.id })}
          uploadHref={(id) => `/api/share/client/${token}/documents/${id}`}
        />

        {invoices.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Invoices</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col divide-y divide-border p-0">
              {invoices.map((inv) => {
                const processing = isPaymentProcessing(inv);
                const canPay =
                  inv.status === "SENT" &&
                  !processing &&
                  (org.stripeConnectChargesEnabled ||
                    !!org.mercuryConnection?.destinationAccountId);
                return (
                  <div
                    key={inv.id}
                    className="flex flex-col gap-3 px-6 py-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <a
                      href={`/share/client/${token}/invoices/${inv.id}/pdf`}
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
                              : "text-muted-foreground",
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
                    {processing ? (
                      <p className="shrink-0 text-xs text-muted-foreground">Bank payment processing</p>
                    ) : canPay ? (
                      <Button size="sm" asChild className="shrink-0">
                        <a href={`/api/share/client/${token}/invoices/${inv.id}/pay`}>
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

        {paymentMethods.length ? (
          <Card>
            <CardHeader className="flex flex-row items-center gap-2">
              <Landmark className="size-4 text-muted-foreground" />
              <CardTitle className="text-base">Payment details</CardTitle>
            </CardHeader>
            <CardContent>
              <PaymentMethodsList methods={paymentMethods} />
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
