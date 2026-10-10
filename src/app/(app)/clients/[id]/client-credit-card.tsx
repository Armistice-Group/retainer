import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency, formatDate } from "@/lib/format";
import { clientCredit } from "@/lib/services/payments";
import { voidCreditNoteAction } from "@/actions/payments";
import { LedgerActionButton } from "@/app/(app)/invoices/[id]/payment-dialogs";
import { DepositInvoiceDialog, IssueCreditNoteDialog } from "./credit-dialogs";

/** Owners and admins: the client's available credit, where it came from,
 * and the tools to add to it (deposits, credit notes). */
export async function ClientCreditCard({
  clientId,
  defaultCurrency,
  projects,
  openInvoices,
}: {
  clientId: string;
  defaultCurrency: string;
  projects: { id: string; name: string; flatFeeAmount: number | null }[];
  openInvoices: { id: string; number: string; status: string; kind: string }[];
}) {
  const [credit, creditNotes, deposits] = await Promise.all([
    clientCredit(clientId),
    prisma.creditNote.findMany({
      where: { clientId },
      include: { invoice: { select: { id: true, number: true } } },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.invoice.findMany({
      where: { clientId, kind: "DEPOSIT", status: { not: "VOID" } },
      select: { id: true, number: true, total: true, amountPaid: true, currency: true, status: true },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
  ]);

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
        <div>
          <CardTitle className="text-base">Deposits and credit</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            Paid deposits, credit notes and overpayments become credit you can apply to this
            client&apos;s sent invoices (Apply credit, on the invoice).
          </p>
        </div>
        <div className="flex gap-2">
          <DepositInvoiceDialog clientId={clientId} projects={projects} currency={defaultCurrency} />
          <IssueCreditNoteDialog
            clientId={clientId}
            currency={defaultCurrency}
            invoices={openInvoices.filter((i) => i.kind === "STANDARD")}
          />
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 text-sm">
        <div className="flex items-center justify-between rounded-md border border-dashed border-border p-3">
          <span className="font-medium">Available credit</span>
          <span className="tabular-figures text-lg font-semibold">
            {credit.length
              ? credit.map((c) => formatCurrency(c.amount, c.currency)).join(" · ")
              : formatCurrency(0, defaultCurrency)}
          </span>
        </div>

        {deposits.length ? (
          <div>
            <p className="mb-1.5 text-xs text-muted-foreground">Deposit invoices</p>
            <ul className="flex flex-col divide-y divide-border">
              {deposits.map((d) => (
                <li key={d.id} className="flex justify-between gap-2 py-2">
                  <Link href={`/invoices/${d.id}`} className="hover:underline">
                    {d.number}
                    <span className="text-muted-foreground">
                      {" "}
                      · {d.status === "DRAFT" ? "draft" : `${formatCurrency(d.amountPaid, d.currency)} paid`}
                    </span>
                  </Link>
                  <span className="tabular-figures">{formatCurrency(d.total, d.currency)}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {creditNotes.length ? (
          <div>
            <p className="mb-1.5 text-xs text-muted-foreground">Credit notes</p>
            <ul className="flex flex-col divide-y divide-border">
              {creditNotes.map((n) => (
                <li key={n.id} className="flex items-start justify-between gap-2 py-2">
                  <div className="min-w-0">
                    <a
                      href={`/credit-notes/${n.id}/pdf`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium hover:underline"
                    >
                      {n.number}
                    </a>
                    {n.status === "VOID" ? <span className="text-muted-foreground"> (void)</span> : null}
                    <p className="text-xs break-words text-muted-foreground">
                      {formatDate(n.issueDate)}
                      {n.invoice ? (
                        <>
                          {" · against "}
                          <Link href={`/invoices/${n.invoice.id}`} className="hover:underline">
                            {n.invoice.number}
                          </Link>
                        </>
                      ) : null}
                      {" · "}
                      {n.reason}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <span className="tabular-figures">{formatCurrency(n.amount, n.currency)}</span>
                    {n.status === "ISSUED" ? (
                      <LedgerActionButton
                        action={voidCreditNoteAction.bind(null, n.id, clientId)}
                        label="Void credit note"
                        confirmMessage={`Void credit note ${n.number}? Its credit is taken away. If it's already been applied to invoices, remove it from them first.`}
                        doneMessage={`${n.number} voided.`}
                      />
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
