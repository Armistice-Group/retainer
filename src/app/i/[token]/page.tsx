import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CreditCard, Download, Paperclip } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { isPaymentProcessing, PaymentReturnBanner, PROCESSING_NOTE } from "@/components/payment-return-banner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InvoiceStatusBadge } from "@/components/invoice-status-badge";
import { balanceDue, isPartlyPaid } from "@/lib/invoice-balance";
import { PaymentMethodsList } from "@/components/payment-methods-list";
import { getInvoiceByViewToken } from "@/lib/services/invoice-delivery";
import { effectivePaymentMethods } from "@/lib/services/payment-methods";
import { formatCurrency, formatDate } from "@/lib/format";
import { daysOverdue, isOverdue } from "@/lib/invoice-aging";
import { formatClockRange } from "@/lib/clock-time";
import { invoiceTimeDetail } from "@/lib/services/invoice-time-detail";
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
  const partlyPaid = isPartlyPaid(invoice);
  const timeDetail = await invoiceTimeDetail(invoice);
  const severalPeople = new Set(timeDetail?.map((e) => e.person)).size > 1;
  const severalProjects = new Set(timeDetail?.map((e) => e.project)).size > 1;

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
              {formatCurrency(partlyPaid ? balanceDue(invoice) : invoice.total, invoice.currency)}
            </h1>
            {partlyPaid ? (
              <p className="tabular-figures text-sm text-muted-foreground">
                due of {formatCurrency(invoice.total, invoice.currency)}
                {Number(invoice.amountPaid) > 0
                  ? ` · ${formatCurrency(invoice.amountPaid, invoice.currency)} paid`
                  : ""}
                {Number(invoice.creditApplied) > 0
                  ? ` · ${formatCurrency(invoice.creditApplied, invoice.currency)} credit applied`
                  : ""}
              </p>
            ) : null}
            <div className="mt-2 flex items-center gap-2 text-sm">
              <InvoiceStatusBadge invoice={invoice} />
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

        {invoice.status === "SENT" && methods.length ? (
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

        {timeDetail ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Time detail</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto p-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th className="px-6 py-2 font-medium">Date</th>
                    <th className="px-2 py-2 font-medium">Time</th>
                    <th className="px-2 py-2 text-right font-medium">Hours</th>
                    {severalPeople ? <th className="px-2 py-2 font-medium">Who</th> : null}
                    <th className="px-2 py-2 pr-6 font-medium">Work</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {timeDetail.map((e) => (
                    <tr key={e.id} className="align-top">
                      <td className="whitespace-nowrap px-6 py-2.5">{formatDate(e.date)}</td>
                      <td className="tabular-figures whitespace-nowrap px-2 py-2.5 text-muted-foreground">
                        {formatClockRange(e.startMinute, e.endMinute) ?? "—"}
                      </td>
                      <td className="tabular-figures px-2 py-2.5 text-right">{e.hours.toFixed(2)}</td>
                      {severalPeople ? <td className="whitespace-nowrap px-2 py-2.5">{e.person}</td> : null}
                      <td className="px-2 py-2.5 pr-6">
                        <p>
                          {[severalProjects ? e.project : null, e.task, e.description].filter(Boolean).join(" · ") ||
                            e.project}
                        </p>
                        {e.evidence.length ? (
                          <ul className="mt-1.5 flex flex-wrap gap-2">
                            {e.evidence.map((file) => (
                              <li key={file.id}>
                                <a
                                  href={`/i/${token}/evidence/${file.id}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 rounded border border-border px-2 py-0.5 text-xs text-muted-foreground hover:text-foreground"
                                >
                                  <Paperclip className="size-3" />
                                  <span className="max-w-48 truncate">{file.fileName}</span>
                                </a>
                              </li>
                            ))}
                          </ul>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        ) : null}
      </main>
    </div>
  );
}
