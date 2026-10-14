import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarClock, Download, Trash2 } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireOrgContext } from "@/lib/org-context";
import { PageHeader } from "@/components/layout/page-header";
import { InvoiceStatusBadge } from "@/components/invoice-status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ConfirmSubmitButton } from "@/components/forms/confirm-submit-button";
import { setInvoiceStatusAction, deleteInvoiceAction } from "@/actions/invoices";
import { formatCurrency, formatDate } from "@/lib/format";
import { InvoiceLinesEditor } from "./invoice-lines-editor";
import { InvoiceDetailsForm } from "./invoice-details-form";
import { toISODate } from "@/lib/date";
import { isOverdue, daysOverdue } from "@/lib/invoice-aging";
import { PushToQuickBooksButton } from "./push-to-quickbooks-button";
import { SendInvoiceButton } from "./send-invoice-button";
import { ScheduleSendDialog } from "./schedule-send-dialog";
import { cancelScheduledSendAction } from "@/actions/invoice-schedule";
import { LocalDateTime } from "@/components/local-date-time";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { MarkPaidDialog } from "./mark-paid-dialog";
import { ApplyCreditDialog, RecordPaymentDialog } from "./payment-dialogs";
import { InvoicePaymentsCard } from "./invoice-payments-card";
import { balanceDue } from "@/lib/invoice-balance";
import { clientCreditCents, invoiceLedger } from "@/lib/services/payments";
import { invoiceVoidBlockedReason } from "@/lib/services/invoices";
import { SyncQuickBooksStatusButton } from "./sync-quickbooks-status-button";
import { EmailInvoiceDialog, CopyClientLinkButton } from "./email-invoice-dialog";
import { InvoiceActivity } from "./invoice-activity";
import { defaultInvoiceRecipients } from "@/lib/services/invoice-delivery";
import { isEmailConfigured } from "@/lib/email";
import { getConfig } from "@/lib/instance-config";
import { invoiceVisibilityWhere } from "@/lib/project-access";

const PAYMENT_TERMS_LABELS: Record<string, string> = {
  DUE_ON_RECEIPT: "Due on receipt",
  NET15: "Net 15",
  NET30: "Net 30",
  NET45: "Net 45",
  NET60: "Net 60",
  NET90: "Net 90",
  CUSTOM: "Custom",
};

const FILED_LABELS: Record<string, string> = {
  GOOGLE_DRIVE: "Google Drive",
  DROPBOX: "Dropbox",
  ONEDRIVE: "OneDrive",
};

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { org, user, role } = await requireOrgContext();

  const invoice = await prisma.invoice.findFirst({
    where: { id, orgId: org.id, ...invoiceVisibilityWhere(user.id, role) },
    include: {
      client: true,
      lineItems: { orderBy: { sortOrder: "asc" }, include: { _count: { select: { timeEntries: true } } } },
    },
  });

  if (!invoice || invoice.orgId !== org.id) notFound();

  const isDraft = invoice.status === "DRAFT";
  const canManage = role === "OWNER" || role === "ADMIN";

  const [ledger, clientCredit] = await Promise.all([
    invoiceLedger(invoice.id),
    canManage ? clientCreditCents(prisma, invoice.clientId) : null,
  ]);
  const balance = balanceDue(invoice);
  const availableCredit = Math.max(0, (clientCredit?.get(invoice.currency) ?? 0) / 100);
  const voidBlocked = invoiceVoidBlockedReason(invoice);
  const hasLedger = ledger.payments.length > 0 || ledger.credits.length > 0 || ledger.creditNotes.length > 0;

  const [quickBooksConnection, events, recipients, emailConfigured, filedCopy, quickBooksEnvironment] = await Promise.all([
    canManage ? prisma.quickBooksConnection.findUnique({ where: { orgId: org.id } }) : null,
    prisma.invoiceEvent.findMany({
      where: { invoiceId: invoice.id },
      include: { actor: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    defaultInvoiceRecipients(invoice.clientId),
    isEmailConfigured(),
    prisma.filedCopy.findFirst({
      where: { kind: "INVOICE", sourceId: invoice.id },
      orderBy: { filedAt: "desc" },
    }),
    getConfig("QUICKBOOKS_ENVIRONMENT"),
  ]);
  // Same default as the API client in lib/integrations/quickbooks: sandbox
  // unless set to production.
  const quickBooksAppUrl =
    quickBooksEnvironment === "production" ? "https://app.qbo.intuit.com" : "https://app.sandbox.qbo.intuit.com";

  return (
    <div>
      <PageHeader
        title={invoice.number}
        description={invoice.client.name}
        actions={
          // Wraps on a phone instead of running off the screen.
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="outline" size="sm" asChild>
              <a href={`/invoices/${invoice.id}/pdf`} target="_blank" rel="noopener noreferrer">
                <Download className="size-3.5" /> Download PDF
              </a>
            </Button>
            {canManage && invoice.status !== "VOID" ? (
              <EmailInvoiceDialog
                invoiceId={invoice.id}
                invoiceNumber={invoice.number}
                recipients={recipients}
                isDraft={isDraft}
                emailed={events.some((e) => e.type === "EMAILED")}
                emailConfigured={emailConfigured}
              />
            ) : null}
            {/* On a draft it sends the invoice, so owners and admins only.
                Without email it's the way to send. */}
            {invoice.status !== "VOID" && (!isDraft || canManage) ? (
              <CopyClientLinkButton invoiceId={invoice.id} isDraft={isDraft} primary={isDraft && !emailConfigured} />
            ) : null}
            {/* Sending, marking paid and voiding are for owners and admins;
                members can generate and edit drafts. */}
            {isDraft && canManage && emailConfigured ? (
              <ScheduleSendDialog
                invoiceId={invoice.id}
                invoiceNumber={invoice.number}
                recipients={recipients}
                emailConfigured={emailConfigured}
                scheduledSendAt={invoice.scheduledSendAt?.toISOString() ?? null}
              />
            ) : null}
            {isDraft && canManage ? <SendInvoiceButton invoiceId={invoice.id} invoiceNumber={invoice.number} /> : null}
            {invoice.status === "SENT" && canManage ? (
              <>
                <RecordPaymentDialog invoiceId={invoice.id} balance={balance} currency={invoice.currency} />
                {invoice.kind === "STANDARD" && availableCredit > 0 && balance > 0 ? (
                  <ApplyCreditDialog
                    invoiceId={invoice.id}
                    balance={balance}
                    available={availableCredit}
                    currency={invoice.currency}
                  />
                ) : null}
                <MarkPaidDialog
                  invoiceId={invoice.id}
                  balanceLabel={formatCurrency(balance, invoice.currency)}
                />
                {/* Once money is recorded the invoice can't be voided; the
                    payments card says why. */}
                {!voidBlocked ? (
                  <form action={setInvoiceStatusAction.bind(null, invoice.id, "VOID")}>
                    <ConfirmSubmitButton
                      variant="outline"
                      size="sm"
                      confirmMessage="Void this invoice? This can't be undone. Its time entries, milestones and expenses become unbilled again so you can invoice them on a new invoice; the voided invoice keeps its lines as a record."
                    >
                      Void
                    </ConfirmSubmitButton>
                  </form>
                ) : null}
              </>
            ) : null}
            {isDraft && canManage ? (
              <form action={deleteInvoiceAction.bind(null, invoice.id)}>
                <ConfirmSubmitButton
                  variant="outline"
                  size="sm"
                  confirmMessage="Delete this draft invoice? Its time entries will become unbilled again."
                >
                  <Trash2 className="size-3.5" /> Delete
                </ConfirmSubmitButton>
              </form>
            ) : null}
          </div>
        }
      />

      {isDraft && invoice.scheduledSendAt ? (
        <Alert variant={invoice.scheduledSendError ? "destructive" : "default"} className="mb-4">
          <CalendarClock />
          <AlertDescription className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {invoice.scheduledSendError ? (
              <span>
                Scheduled to send <LocalDateTime iso={invoice.scheduledSendAt.toISOString()} />, but
                it wasn&apos;t sent: {invoice.scheduledSendError}{" "}It&apos;s still a draft. Send it
                now, or reschedule it once that&apos;s fixed.
              </span>
            ) : (
              <span>
                Scheduled to send <LocalDateTime iso={invoice.scheduledSendAt.toISOString()} /> to{" "}
                {recipients.join(", ") || "the client"}. The issue date becomes the day it goes out.
              </span>
            )}
            {canManage ? (
              <form action={cancelScheduledSendAction.bind(null, invoice.id)}>
                <Button type="submit" variant="link" size="sm" className="h-auto p-0">
                  Cancel schedule
                </Button>
              </form>
            ) : null}
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="mb-6 flex items-center gap-2">
        <InvoiceStatusBadge invoice={invoice} />
        {isOverdue(invoice.status, invoice.dueDate) ? (
          <span className="text-sm font-medium text-destructive">
            {daysOverdue(invoice.dueDate)} day{daysOverdue(invoice.dueDate) === 1 ? "" : "s"} overdue
          </span>
        ) : null}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Line items</CardTitle>
            </CardHeader>
            <CardContent>
              {isDraft ? (
                <InvoiceLinesEditor
                  invoiceId={invoice.id}
                  currency={invoice.currency}
                  lines={invoice.lineItems.map((item) => ({
                    id: item.id,
                    description: item.description,
                    quantity: item.quantity.toString(),
                    rate: Number(item.rate).toFixed(2),
                    fromTime: item._count.timeEntries > 0,
                  }))}
                />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-xs text-muted-foreground">
                        <th className="py-2 pr-2 font-medium">Description</th>
                        <th className="px-2 py-2 text-right font-medium">Qty</th>
                        <th className="px-2 py-2 text-right font-medium">Rate</th>
                        <th className="py-2 pl-2 text-right font-medium">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {invoice.lineItems.map((item) => (
                        <tr key={item.id} className="align-top">
                          <td className="py-2.5 pr-2 whitespace-pre-line">{item.description}</td>
                          <td className="tabular-figures px-2 py-2.5 text-right">
                            {Number(item.quantity)}
                            {item._count.timeEntries > 0 ? " hrs" : ""}
                          </td>
                          <td className="tabular-figures px-2 py-2.5 text-right whitespace-nowrap">
                            {formatCurrency(item.rate, invoice.currency)}
                          </td>
                          <td className="tabular-figures py-2.5 pl-2 text-right whitespace-nowrap">
                            {formatCurrency(item.amount, invoice.currency)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          {isDraft ? (
            <Card className="mt-4">
              <CardHeader>
                <CardTitle className="text-base">Details</CardTitle>
              </CardHeader>
              <CardContent>
                <InvoiceDetailsForm
                  invoiceId={invoice.id}
                  values={{
                    issueDate: toISODate(invoice.issueDate),
                    dueDate: toISODate(invoice.dueDate),
                    paymentTerms: invoice.paymentTerms,
                    poNumber: invoice.poNumber ?? "",
                    taxRate: invoice.taxRate.toString(),
                    notes: invoice.notes ?? "",
                  }}
                />
              </CardContent>
            </Card>
          ) : (
            <Card className="mt-4">
              <CardHeader>
                <CardTitle className="text-base">Billing details</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3 text-sm">
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">Issued</span>
                  <span>{formatDate(invoice.issueDate)}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">Due</span>
                  <span>{formatDate(invoice.dueDate)}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">Payment terms</span>
                  <span>{PAYMENT_TERMS_LABELS[invoice.paymentTerms]}</span>
                </div>
                {invoice.poNumber ? (
                  <div className="flex justify-between gap-4">
                    <span className="text-muted-foreground">PO number</span>
                    <span>{invoice.poNumber}</span>
                  </div>
                ) : null}
                {invoice.paymentMethod ? (
                  <div className="flex justify-between gap-4">
                    <span className="text-muted-foreground">Payment method</span>
                    <span>{invoice.paymentMethod}</span>
                  </div>
                ) : null}
                {invoice.notes ? (
                  <p className="border-t border-border pt-3 text-muted-foreground">
                    {invoice.notes}
                  </p>
                ) : null}
              </CardContent>
            </Card>
          )}

          <Card className="mt-4 gap-0 overflow-hidden p-0">
            <details className="group">
              <summary className="cursor-pointer px-6 py-4 text-base font-medium select-none">
                Preview PDF
              </summary>
              <iframe
                src={`/invoices/${invoice.id}/pdf`}
                title={`Invoice ${invoice.number} PDF`}
                loading="lazy"
                className="h-[75vh] min-h-[480px] w-full border-t border-border bg-muted"
              />
            </details>
          </Card>
        </div>

        <div>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Summary</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="tabular-figures">
                  {formatCurrency(invoice.subtotal, invoice.currency)}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Tax ({invoice.taxRate.toString()}%)</span>
                <span className="tabular-figures">
                  {formatCurrency(invoice.taxAmount, invoice.currency)}
                </span>
              </div>
              <div className="flex justify-between border-t border-border pt-2 text-base font-semibold">
                <span>Total</span>
                <span className="tabular-figures">
                  {formatCurrency(invoice.total, invoice.currency)}
                </span>
              </div>
              {Number(invoice.amountPaid) > 0 ? (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Paid</span>
                  <span className="tabular-figures">
                    −{formatCurrency(invoice.amountPaid, invoice.currency)}
                  </span>
                </div>
              ) : null}
              {Number(invoice.creditApplied) > 0 ? (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Credit applied</span>
                  <span className="tabular-figures">
                    −{formatCurrency(invoice.creditApplied, invoice.currency)}
                  </span>
                </div>
              ) : null}
              {invoice.status === "SENT" || invoice.status === "PAID" ? (
                <div className="flex justify-between border-t border-border pt-2 text-sm font-semibold">
                  <span>Balance due</span>
                  <span className="tabular-figures">{formatCurrency(balance, invoice.currency)}</span>
                </div>
              ) : null}
              <Link
                href={`/clients/${invoice.clientId}`}
                className="mt-3 text-sm text-brand hover:underline"
              >
                View client
              </Link>
              {filedCopy?.externalUrl ? (
                <a
                  href={filedCopy.externalUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-muted-foreground hover:underline"
                >
                  Filed to {FILED_LABELS[filedCopy.provider] ?? filedCopy.provider} ↗
                </a>
              ) : null}
            </CardContent>
          </Card>

          {hasLedger || invoice.kind === "DEPOSIT" ? (
            <InvoicePaymentsCard
              invoiceId={invoice.id}
              clientId={invoice.clientId}
              clientName={invoice.client.name}
              currency={invoice.currency}
              isDeposit={invoice.kind === "DEPOSIT"}
              canManage={canManage}
              voidBlocked={invoice.status === "SENT" ? voidBlocked : null}
              payments={ledger.payments.map((p) => ({
                id: p.id,
                amount: Number(p.amount),
                receivedAt: p.receivedAt,
                source: p.source,
                method: p.method,
                reference: p.reference,
                note: p.note,
                recordedBy: p.recordedBy?.name ?? null,
              }))}
              credits={ledger.credits.map((c) => ({
                id: c.id,
                amount: Number(c.amount),
                createdAt: c.createdAt,
                note: c.note,
                appliedBy: c.appliedBy?.name ?? null,
              }))}
              creditNotes={ledger.creditNotes.map((n) => ({
                id: n.id,
                number: n.number,
                amount: Number(n.amount),
                status: n.status,
                reason: n.reason,
              }))}
            />
          ) : null}

          <InvoiceActivity
            viewCount={invoice.viewCount}
            events={events.map((e) => ({
              id: e.id,
              type: e.type,
              recipients: e.recipients,
              detail: e.detail,
              actorName: e.actor?.name ?? null,
              createdAt: e.createdAt,
            }))}
          />

          {quickBooksConnection ? (
            <Card className="mt-4">
              <CardHeader>
                <CardTitle className="text-base">QuickBooks</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col items-end gap-3">
                {invoice.quickbooksSyncedAt ? (
                  <a
                    href={`${quickBooksAppUrl}/app/invoice?txnId=${invoice.quickbooksInvoiceId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="self-start text-sm text-brand hover:underline"
                  >
                    View in QuickBooks
                  </a>
                ) : null}
                <PushToQuickBooksButton
                  invoiceId={invoice.id}
                  alreadySynced={!!invoice.quickbooksSyncedAt}
                />
                {invoice.quickbooksInvoiceId ? (
                  <SyncQuickBooksStatusButton invoiceId={invoice.id} />
                ) : null}
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}
