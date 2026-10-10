import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CreditCard, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { isPaymentProcessing, PaymentReturnBanner, PROCESSING_NOTE } from "@/components/payment-return-banner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/status-badge";
import { PaymentMethodsList } from "@/components/payment-methods-list";
import { getInvoiceByViewToken } from "@/lib/services/invoice-delivery";
import { effectivePaymentMethods } from "@/lib/services/payment-methods";
import { formatCurrency, formatDate } from "@/lib/format";
import { daysOverdue, isOverdue } from "@/lib/invoice-aging";
import { SeenBeacon } from "./seen-beacon";

export const metadata: Metadata = {
  title: "Invoice",
  robots: { index: false, follow: false },
};

export default async function ClientInvoicePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ paid?: string; reason?: string }>;
}) {
  const { token } = await params;
  const { paid, reason } = await searchParams;
  const invoice = await getInvoiceByViewToken(token);
  if (!invoice) notFound();

  const org = invoice.org;
  const logoSrc = org.logoData
    ? `data:${org.logoContentType};base64,${Buffer.from(org.logoData).toString("base64")}`
    : org.logoUrl;
  const methods = await effectivePaymentMethods(org.id, invoice.clientId);
  const paymentProcessing = isPaymentProcessing(invoice);
  const canPayOnline =
    invoice.status === "SENT" &&
    !paymentProcessing &&
    (org.stripeConnectChargesEnabled || !!org.mercuryConnection?.destinationAccountId);
  const overdue = isOverdue(invoice.status, invoice.dueDate);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SeenBeacon token={token} />
      <header className="border-b border-border">
        <div className="mx-auto flex w-full max-w-4xl items-center justify-between px-4 py-5 sm:px-6">
          {logoSrc ? (
            // eslint-disable-next-line @next/next/no-img-element -- external/data-URI logo
            <img src={logoSrc} alt={org.name} className="h-8 max-w-[160px] object-contain" />
          ) : (
            <span className="text-lg font-semibold tracking-tight">{org.name}</span>
          )}
          <span className="text-sm text-muted-foreground">Invoice {invoice.number}</span>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-4xl flex-col gap-4 px-4 py-8 sm:px-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm text-muted-foreground">
              {invoice.client.name} · Issued {formatDate(invoice.issueDate)}
            </p>
            <h1 className="tabular-figures mt-1 text-3xl font-semibold tracking-tight">
              {formatCurrency(invoice.total, invoice.currency)}
            </h1>
            <div className="mt-2 flex items-center gap-2 text-sm">
              <StatusBadge status={invoice.status} />
              {invoice.status === "VOID" ? (
                <span className="text-muted-foreground">This invoice was voided.</span>
              ) : invoice.status === "PAID" ? (
                <span className="text-muted-foreground">Paid — thank you.</span>
              ) : (
                <span className={overdue ? "font-medium text-destructive" : "text-muted-foreground"}>
                  Due {formatDate(invoice.dueDate)}
                  {overdue ? ` · ${daysOverdue(invoice.dueDate)} days overdue` : ""}
                </span>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" asChild>
              <a href={`/i/${token}/pdf?download=1`}>
                <Download /> Download PDF
              </a>
            </Button>
            {canPayOnline ? (
              <Button asChild>
                <a href={`/i/${token}/pay`}>
                  <CreditCard /> Pay now
                </a>
              </Button>
            ) : null}
          </div>
        </div>

        {paymentProcessing && paid !== "success" ? (
          <Alert>
            <AlertDescription>A bank payment for this invoice is processing. {PROCESSING_NOTE}</AlertDescription>
          </Alert>
        ) : (
          <PaymentReturnBanner
            paid={paid}
            reason={reason}
            invoice={{ status: invoice.status, processing: paymentProcessing }}
            orgName={org.name}
            hasPaymentMethods={methods.length > 0}
          />
        )}

        {invoice.status !== "VOID" && methods.length ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">How to pay</CardTitle>
            </CardHeader>
            <CardContent>
              <PaymentMethodsList methods={methods} />
            </CardContent>
          </Card>
        ) : null}

        <Card className="overflow-hidden p-0">
          <iframe
            src={`/i/${token}/pdf?embed=1`}
            title={`Invoice ${invoice.number}`}
            className="h-[80vh] min-h-[480px] w-full bg-muted"
          />
        </Card>
      </main>
    </div>
  );
}
