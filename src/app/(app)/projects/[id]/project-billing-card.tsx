import Link from "next/link";
import { FileText, Plus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/status-badge";
import { formatCurrency, formatDate } from "@/lib/format";
import { isOverdue, daysOverdue } from "@/lib/invoice-aging";
import { cn } from "@/lib/utils";

export type ProjectInvoiceItem = {
  id: string;
  number: string;
  status: string;
  dueDate: string;
  lineItemTotal: number;
  currency: string;
};

export function ProjectBillingCard({
  clientId,
  currency,
  budgetHours,
  loggedHours,
  flatFeeAmount,
  invoicedTotal,
  invoices,
}: {
  clientId: string;
  currency: string;
  budgetHours: number | null;
  loggedHours: number;
  flatFeeAmount: number | null;
  invoicedTotal: number;
  invoices: ProjectInvoiceItem[];
}) {
  const budgetPercent = budgetHours ? Math.min(100, (loggedHours / budgetHours) * 100) : 0;
  const over = budgetHours != null && loggedHours > budgetHours;
  const nearLimit = budgetHours != null && !over && budgetPercent >= 80;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Billing</CardTitle>
        <Button size="sm" asChild>
          <Link href={`/invoices/new?clientId=${clientId}`}>
            <Plus className="size-3.5" /> Generate invoice
          </Link>
        </Button>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
          {flatFeeAmount != null ? (
            <div>
              <p className="text-xs text-muted-foreground">Flat fee</p>
              <p className="tabular-figures text-lg font-semibold">
                {formatCurrency(flatFeeAmount, currency)}
              </p>
            </div>
          ) : null}
          <div>
            <p className="text-xs text-muted-foreground">Invoiced to date</p>
            <p className="tabular-figures text-lg font-semibold">
              {formatCurrency(invoicedTotal, currency)}
            </p>
          </div>
          {budgetHours != null ? (
            <div>
              <p className="text-xs text-muted-foreground">Hours logged</p>
              <p className="tabular-figures text-lg font-semibold">
                {loggedHours.toFixed(2)}
                <span className="text-sm font-normal text-muted-foreground">
                  {" "}
                  / {budgetHours.toFixed(2)}
                </span>
              </p>
            </div>
          ) : null}
        </div>

        {budgetHours != null ? (
          <div className="flex flex-col gap-1.5">
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className={cn(
                  "h-full rounded-full transition-all",
                  over ? "bg-destructive" : nearLimit ? "bg-chart-4" : "bg-brand"
                )}
                style={{ width: `${budgetPercent}%` }}
              />
            </div>
            {over ? (
              <p className="text-xs text-destructive">
                {(loggedHours - budgetHours).toFixed(2)}h over budget
              </p>
            ) : nearLimit ? (
              <p className="text-xs text-chart-4">{(budgetHours - loggedHours).toFixed(2)}h remaining</p>
            ) : null}
          </div>
        ) : null}

        {invoices.length > 0 ? (
          <ul className="flex flex-col divide-y divide-border border-t border-border pt-1">
            {invoices.map((invoice) => (
              <li key={invoice.id}>
                <Link
                  href={`/invoices/${invoice.id}`}
                  className="flex items-center justify-between gap-3 py-2 text-sm hover:underline"
                >
                  <div className="flex items-center gap-2">
                    <FileText className="size-3.5 shrink-0 text-muted-foreground" />
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
                      {formatCurrency(invoice.lineItemTotal, invoice.currency)}
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="border-t border-border pt-3 text-sm text-muted-foreground">
            Nothing invoiced for this project yet.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
