import Link from "next/link";
import { FileText, Plus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/status-badge";
import { EmptyState } from "@/components/empty-state";
import { formatCurrency, formatDate } from "@/lib/format";
import { isOverdue, daysOverdue } from "@/lib/invoice-aging";
import { cn } from "@/lib/utils";

export type ClientInvoiceItem = {
  id: string;
  number: string;
  status: string;
  dueDate: string;
  total: number;
  currency: string;
};

export function ClientInvoicesCard({
  clientId,
  invoices,
  retainerBalance,
}: {
  clientId: string;
  invoices: ClientInvoiceItem[];
  retainerBalance: { entitledHours: number; loggedHours: number } | null;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Invoices</CardTitle>
        <Button size="sm" asChild>
          <Link href={`/invoices/new?clientId=${clientId}`}>
            <Plus className="size-3.5" /> New invoice
          </Link>
        </Button>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {retainerBalance ? (
          <div className="flex items-center justify-between rounded-md border border-dashed border-border p-3 text-sm">
            <div>
              <p className="font-medium">Retainer balance</p>
              <p className="text-xs text-muted-foreground">
                {retainerBalance.entitledHours.toFixed(2)}h billed &minus;{" "}
                {retainerBalance.loggedHours.toFixed(2)}h logged
              </p>
            </div>
            <span
              className={cn(
                "tabular-figures text-lg font-semibold",
                retainerBalance.entitledHours - retainerBalance.loggedHours < 0
                  ? "text-destructive"
                  : "text-foreground"
              )}
            >
              {(retainerBalance.entitledHours - retainerBalance.loggedHours).toFixed(2)}h
            </span>
          </div>
        ) : null}

        {invoices.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="No invoices yet"
            description="Generate an invoice from this client's unbilled time, milestones, or expenses."
          />
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {invoices.map((invoice) => (
              <li key={invoice.id}>
                <Link
                  href={`/invoices/${invoice.id}`}
                  className="flex items-center justify-between gap-3 py-2.5 text-sm hover:underline"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{invoice.number}</span>
                    <StatusBadge status={invoice.status} />
                  </div>
                  <div className="flex items-center gap-3">
                    <span
                      className={cn(
                        "text-xs",
                        isOverdue(invoice.status, new Date(invoice.dueDate))
                          ? "font-medium text-destructive"
                          : "text-muted-foreground"
                      )}
                    >
                      {formatDate(invoice.dueDate)}
                      {isOverdue(invoice.status, new Date(invoice.dueDate))
                        ? ` (${daysOverdue(new Date(invoice.dueDate))}d overdue)`
                        : ""}
                    </span>
                    <span className="tabular-figures font-medium">
                      {formatCurrency(invoice.total, invoice.currency)}
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
