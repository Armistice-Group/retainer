import Link from "next/link";
import { notFound } from "next/navigation";
import { Download, Plus, Trash2 } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireOrgContext } from "@/lib/org-context";
import { PageHeader } from "@/components/layout/page-header";
import { InvoiceStatusBadge } from "@/components/invoice-status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ConfirmSubmitButton } from "@/components/forms/confirm-submit-button";
import {
  updateInvoiceMetaAction,
  updateLineItemAction,
  addManualLineItemAction,
  removeLineItemAction,
  setInvoiceStatusAction,
  deleteInvoiceAction,
} from "@/actions/invoices";
import { formatCurrency } from "@/lib/format";
import { toISODate } from "@/lib/date";
import { isOverdue, daysOverdue } from "@/lib/invoice-aging";
import { PushToQuickBooksButton } from "./push-to-quickbooks-button";
import { SendInvoiceButton } from "./send-invoice-button";
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
    include: { client: true, lineItems: { orderBy: { sortOrder: "asc" } } },
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
          <>
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
                emailConfigured={emailConfigured}
              />
            ) : null}
            {!isDraft && invoice.status !== "VOID" ? (
              <CopyClientLinkButton invoiceId={invoice.id} />
            ) : null}
            {/* Sending, marking paid and voiding are for owners and admins;
                members can generate and edit drafts. */}
            {isDraft && canManage ? <SendInvoiceButton invoiceId={invoice.id} /> : null}
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
          </>
        }
      />

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
            <CardContent className="flex flex-col gap-3">
              {invoice.lineItems.map((item) => (
                <form
                  key={item.id}
                  action={updateLineItemAction.bind(null, item.id, invoice.id)}
                  className="flex items-end gap-2 border-b border-border pb-3 last:border-0 last:pb-0"
                >
                  <div className="flex-1">
                    <Input
                      name="description"
                      defaultValue={item.description}
                      disabled={!isDraft}
                      className="disabled:opacity-100"
                    />
                  </div>
                  <div className="w-20">
                    <Input
                      name="quantity"
                      type="number"
                      step="0.01"
                      defaultValue={item.quantity.toString()}
                      disabled={!isDraft}
                      className="tabular-figures disabled:opacity-100"
                    />
                  </div>
                  <div className="w-28">
                    <Input
                      name="rate"
                      type="number"
                      step="0.01"
                      defaultValue={item.rate.toString()}
                      disabled={!isDraft}
                      className="tabular-figures disabled:opacity-100"
                    />
                  </div>
                  <div className="tabular-figures w-24 shrink-0 text-right text-sm">
                    {formatCurrency(item.amount, invoice.currency)}
                  </div>
                  {isDraft ? (
                    <div className="flex shrink-0 gap-1">
                      <Button variant="outline" size="sm" type="submit">
                        Save
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8"
                        type="submit"
                        formAction={removeLineItemAction.bind(null, item.id, invoice.id)}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  ) : null}
                </form>
              ))}

              {isDraft ? (
                <form
                  action={addManualLineItemAction.bind(null, invoice.id)}
                  className="flex items-end gap-2 pt-1"
                >
                  <div className="flex-1">
                    <Label className="mb-1.5 text-xs text-muted-foreground">Description</Label>
                    <Input name="description" placeholder="Additional item" required />
                  </div>
                  <div className="w-20">
                    <Label className="mb-1.5 text-xs text-muted-foreground">Qty</Label>
                    <Input name="quantity" type="number" step="0.01" defaultValue="1" required />
                  </div>
                  <div className="w-28">
                    <Label className="mb-1.5 text-xs text-muted-foreground">Rate</Label>
                    <Input name="rate" type="number" step="0.01" defaultValue="0" required />
                  </div>
                  <Button variant="outline" size="sm" type="submit" className="shrink-0">
                    <Plus className="size-3.5" /> Add
                  </Button>
                </form>
              ) : null}
            </CardContent>
          </Card>

          {isDraft ? (
            <Card className="mt-4">
              <CardHeader>
                <CardTitle className="text-base">Details</CardTitle>
              </CardHeader>
              <CardContent>
                <form
                  action={updateInvoiceMetaAction.bind(null, invoice.id)}
                  className="grid gap-4 sm:grid-cols-2"
                >
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="issueDate">Issue date</Label>
                    <Input
                      id="issueDate"
                      name="issueDate"
                      type="date"
                      defaultValue={toISODate(invoice.issueDate)}
                      required
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="dueDate">Due date</Label>
                    <Input
                      id="dueDate"
                      name="dueDate"
                      type="date"
                      defaultValue={toISODate(invoice.dueDate)}
                      required
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="paymentTerms">Payment terms</Label>
                    <Select name="paymentTerms" defaultValue={invoice.paymentTerms}>
                      <SelectTrigger id="paymentTerms" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(PAYMENT_TERMS_LABELS).map(([value, label]) => (
                          <SelectItem key={value} value={value}>
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="poNumber">PO number</Label>
                    <Input
                      id="poNumber"
                      name="poNumber"
                      placeholder="e.g. PO-4821"
                      defaultValue={invoice.poNumber ?? ""}
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="taxRate">Tax rate (%)</Label>
                    <Input
                      id="taxRate"
                      name="taxRate"
                      type="number"
                      step="0.01"
                      defaultValue={invoice.taxRate.toString()}
                      required
                    />
                  </div>
                  <div className="flex flex-col gap-2 sm:col-span-2">
                    <Label htmlFor="notes">Notes</Label>
                    <Textarea
                      id="notes"
                      name="notes"
                      rows={3}
                      defaultValue={invoice.notes ?? ""}
                    />
                  </div>
                  <div>
                    <Button size="sm" type="submit">
                      Save details
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          ) : (
            <Card className="mt-4">
              <CardHeader>
                <CardTitle className="text-base">Billing details</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3 text-sm">
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
