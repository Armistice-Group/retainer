import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/status-badge";
import { partlyPaidLabel, type InvoiceAmounts } from "@/lib/invoice-balance";
import { isOverdue } from "@/lib/invoice-aging";

/** An invoice's status, saying "Partly paid · $X due" for a sent invoice
 * with part of it paid or credited, "Overdue" once a sent one is past due,
 * and marking deposit invoices. */
export function InvoiceStatusBadge({
  invoice,
}: {
  invoice: InvoiceAmounts & { status: string; currency: string; kind?: string; dueDate?: Date };
}) {
  const partly = partlyPaidLabel(invoice);
  const overdue = !!invoice.dueDate && isOverdue(invoice.status, invoice.dueDate);
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      {partly ? (
        <Badge variant="outline" className="border-chart-4/30 bg-chart-4/15 font-normal text-chart-4">
          {partly}
        </Badge>
      ) : overdue ? (
        <Badge variant="outline" className="border-destructive/30 bg-destructive/10 font-normal text-destructive">
          Overdue
        </Badge>
      ) : (
        <StatusBadge status={invoice.status} />
      )}
      {invoice.kind === "DEPOSIT" ? (
        <Badge variant="outline" className="font-normal text-muted-foreground">
          Deposit
        </Badge>
      ) : null}
    </span>
  );
}
