import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/status-badge";
import { partlyPaidLabel, type InvoiceAmounts } from "@/lib/invoice-balance";

/** An invoice's status, saying "Partly paid · $X due" for a sent invoice
 * with part of it paid or credited, and marking deposit invoices. */
export function InvoiceStatusBadge({
  invoice,
}: {
  invoice: InvoiceAmounts & { status: string; currency: string; kind?: string };
}) {
  const partly = partlyPaidLabel(invoice);
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      {partly ? (
        <Badge variant="outline" className="border-chart-4/30 bg-chart-4/15 font-normal text-chart-4">
          {partly}
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
