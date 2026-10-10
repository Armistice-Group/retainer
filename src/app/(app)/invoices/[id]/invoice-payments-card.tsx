import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency, formatDate } from "@/lib/format";
import { deletePaymentAction, removeCreditApplicationAction } from "@/actions/payments";
import { LedgerActionButton } from "./payment-dialogs";

const SOURCE_LABELS: Record<string, string> = {
  MANUAL: "Manual",
  STRIPE: "Stripe",
  MERCURY: "Mercury",
  QUICKBOOKS: "QuickBooks",
};

export type PaymentRow = {
  id: string;
  amount: number;
  receivedAt: Date;
  source: string;
  method: string | null;
  reference: string | null;
  note: string | null;
  recordedBy: string | null;
};

export type CreditRow = {
  id: string;
  amount: number;
  createdAt: Date;
  note: string | null;
  appliedBy: string | null;
};

export type CreditNoteRow = {
  id: string;
  number: string;
  amount: number;
  status: string;
  reason: string;
};

/** Payments and applied credit on an invoice, with delete for owners and
 * admins (both reopen the invoice if it was paid). */
export function InvoicePaymentsCard({
  invoiceId,
  clientId,
  clientName,
  currency,
  isDeposit,
  canManage,
  voidBlocked,
  payments,
  credits,
  creditNotes,
}: {
  invoiceId: string;
  clientId: string;
  clientName: string;
  currency: string;
  isDeposit: boolean;
  canManage: boolean;
  /** Why the invoice can't be voided, shown while it's open. */
  voidBlocked: string | null;
  payments: PaymentRow[];
  credits: CreditRow[];
  creditNotes: CreditNoteRow[];
}) {
  return (
    <Card className="mt-4">
      <CardHeader>
        <CardTitle className="text-base">Payments</CardTitle>
        {isDeposit ? (
          <p className="text-xs text-muted-foreground">
            This is a deposit. Payments on it become credit for{" "}
            <Link href={`/clients/${clientId}`} className="text-brand hover:underline">
              {clientName}
            </Link>{" "}
            to apply to later invoices.
          </p>
        ) : null}
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm">
        {payments.length === 0 && credits.length === 0 ? (
          <p className="text-muted-foreground">No payments recorded yet.</p>
        ) : null}
        <ul className="flex flex-col gap-3">
          {payments.map((p) => (
            <li key={p.id} className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="tabular-figures font-medium">{formatCurrency(p.amount, currency)}</p>
                <p className="text-xs text-muted-foreground">
                  {formatDate(p.receivedAt)} · {[p.method, SOURCE_LABELS[p.source] ?? p.source].filter(Boolean).join(" · ")}
                  {p.reference ? ` · ${p.reference}` : ""}
                </p>
                {p.note ? <p className="text-xs break-words text-muted-foreground">{p.note}</p> : null}
                {p.recordedBy ? <p className="text-xs text-muted-foreground">Recorded by {p.recordedBy}</p> : null}
              </div>
              {canManage ? (
                <LedgerActionButton
                  action={deletePaymentAction.bind(null, p.id, invoiceId)}
                  label="Delete payment"
                  confirmMessage={`Delete this ${formatCurrency(p.amount, currency)} payment? Only do this if it was recorded by mistake. If the invoice was paid, it reopens with this amount due again.${p.source === "MANUAL" ? "" : " Deleting it here doesn't refund or cancel anything with the payment provider."}`}
                  doneMessage="Payment deleted."
                />
              ) : null}
            </li>
          ))}
          {credits.map((c) => (
            <li key={c.id} className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="tabular-figures font-medium">
                  {formatCurrency(c.amount, currency)} <span className="font-normal text-muted-foreground">credit applied</span>
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatDate(c.createdAt)}
                  {c.note ? ` · ${c.note}` : ""}
                  {c.appliedBy ? ` · by ${c.appliedBy}` : ""}
                </p>
              </div>
              {canManage ? (
                <LedgerActionButton
                  action={removeCreditApplicationAction.bind(null, c.id, invoiceId)}
                  label="Remove credit"
                  confirmMessage={`Take this ${formatCurrency(c.amount, currency)} of credit back off the invoice? It goes back to the client's available credit, and the invoice reopens if it was paid.`}
                  doneMessage="Credit removed."
                />
              ) : null}
            </li>
          ))}
        </ul>
        {creditNotes.length ? (
          <div className="border-t border-border pt-3">
            <p className="mb-1.5 text-xs text-muted-foreground">Credit notes issued against this invoice</p>
            <ul className="flex flex-col gap-1">
              {creditNotes.map((n) => (
                <li key={n.id} className="flex justify-between gap-2">
                  <a
                    href={`/credit-notes/${n.id}/pdf`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:underline"
                  >
                    {n.number}
                    {n.status === "VOID" ? " (void)" : ""}
                  </a>
                  <span className="tabular-figures">{formatCurrency(n.amount, currency)}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {voidBlocked && canManage ? <p className="text-xs text-muted-foreground">{voidBlocked}</p> : null}
      </CardContent>
    </Card>
  );
}
