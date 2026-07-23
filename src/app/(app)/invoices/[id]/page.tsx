import Link from "next/link";
import { notFound } from "next/navigation";
import { Download, Plus, Trash2 } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireOrgContext } from "@/lib/org-context";
import { PageHeader } from "@/components/layout/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { PushToQuickBooksButton } from "./push-to-quickbooks-button";

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { org, role } = await requireOrgContext();

  const invoice = await prisma.invoice.findUnique({
    where: { id },
    include: { client: true, lineItems: { orderBy: { sortOrder: "asc" } } },
  });

  if (!invoice || invoice.orgId !== org.id) notFound();

  const isDraft = invoice.status === "DRAFT";
  const canManage = role === "OWNER" || role === "ADMIN";

  const quickBooksConnection = canManage
    ? await prisma.quickBooksConnection.findUnique({ where: { orgId: org.id } })
    : null;

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
            {isDraft ? (
              <form action={setInvoiceStatusAction.bind(null, invoice.id, "SENT")}>
                <Button size="sm" type="submit">
                  Mark as sent
                </Button>
              </form>
            ) : null}
            {invoice.status === "SENT" ? (
              <>
                <form action={setInvoiceStatusAction.bind(null, invoice.id, "PAID")}>
                  <Button size="sm" type="submit">
                    Mark as paid
                  </Button>
                </form>
                <form action={setInvoiceStatusAction.bind(null, invoice.id, "VOID")}>
                  <ConfirmSubmitButton
                    variant="outline"
                    size="sm"
                    confirmMessage="Void this invoice? This can't be undone."
                  >
                    Void
                  </ConfirmSubmitButton>
                </form>
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

      <div className="mb-6">
        <StatusBadge status={invoice.status} />
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
          ) : invoice.notes ? (
            <Card className="mt-4">
              <CardHeader>
                <CardTitle className="text-base">Notes</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{invoice.notes}</p>
              </CardContent>
            </Card>
          ) : null}
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
              <Link
                href={`/clients/${invoice.clientId}`}
                className="mt-3 text-sm text-primary hover:underline"
              >
                View client
              </Link>
            </CardContent>
          </Card>

          {quickBooksConnection ? (
            <Card className="mt-4">
              <CardHeader>
                <CardTitle className="text-base">QuickBooks</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col items-end gap-3">
                {invoice.quickbooksSyncedAt ? (
                  <a
                    href={`https://app.qbo.intuit.com/app/invoice?txnId=${invoice.quickbooksInvoiceId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="self-start text-sm text-primary hover:underline"
                  >
                    View in QuickBooks
                  </a>
                ) : null}
                <PushToQuickBooksButton
                  invoiceId={invoice.id}
                  alreadySynced={!!invoice.quickbooksSyncedAt}
                />
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}
