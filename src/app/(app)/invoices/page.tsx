import Link from "next/link";
import { CalendarClock, FileText, Plus } from "lucide-react";
import { LocalDateTime } from "@/components/local-date-time";
import { prisma } from "@/lib/prisma";
import { requireOrgContext } from "@/lib/org-context";
import { invoiceVisibilityWhere } from "@/lib/project-access";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/empty-state";
import { InvoiceStatusBadge } from "@/components/invoice-status-badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCurrency, formatDate } from "@/lib/format";
import { isOverdue, daysOverdue } from "@/lib/invoice-aging";
import { cn } from "@/lib/utils";

export default async function InvoicesPage() {
  const { org, user, role } = await requireOrgContext();

  const invoices = await prisma.invoice.findMany({
    where: { orgId: org.id, ...invoiceVisibilityWhere(user.id, role) },
    include: { client: true },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div>
      <PageHeader
        title="Invoices"
        description="Generate invoices from unbilled time and track payment status."
        actions={
          <Button asChild>
            <Link href="/invoices/new">
              <Plus className="size-4" /> New invoice
            </Link>
          </Button>
        }
      />

      {invoices.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No invoices yet"
          description="Generate your first invoice from unbilled, billable time entries."
          action={
            <Button asChild size="sm">
              <Link href="/invoices/new">
                <Plus className="size-4" /> New invoice
              </Link>
            </Button>
          }
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Number</TableHead>
              <TableHead>Client</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Due</TableHead>
              <TableHead className="text-right">Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {invoices.map((invoice) => (
              <TableRow key={invoice.id} className="cursor-pointer">
                <TableCell className="p-0">
                  <Link
                    href={`/invoices/${invoice.id}`}
                    className="block p-2 font-medium hover:underline"
                  >
                    {invoice.number}
                  </Link>
                </TableCell>
                <TableCell className="p-0">
                  <Link href={`/invoices/${invoice.id}`} className="block p-2">
                    {invoice.client.name}
                  </Link>
                </TableCell>
                <TableCell className="p-0">
                  <Link
                    href={`/invoices/${invoice.id}`}
                    className="flex flex-wrap items-center gap-x-2 gap-y-1 p-2"
                  >
                    <InvoiceStatusBadge invoice={invoice} />
                    {invoice.status === "DRAFT" && invoice.scheduledSendAt ? (
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 text-xs",
                          invoice.scheduledSendError ? "text-destructive" : "text-muted-foreground"
                        )}
                        title={invoice.scheduledSendError ?? undefined}
                      >
                        <CalendarClock className="size-3" />
                        {invoice.scheduledSendError ? "Scheduled send failed" : "Sends"}{" "}
                        <LocalDateTime iso={invoice.scheduledSendAt.toISOString()} dateOnly />
                      </span>
                    ) : null}
                  </Link>
                </TableCell>
                <TableCell className="p-0">
                  <Link
                    href={`/invoices/${invoice.id}`}
                    className={cn(
                      "block p-2 tabular-figures",
                      isOverdue(invoice.status, invoice.dueDate)
                        ? "font-medium text-destructive"
                        : "text-muted-foreground"
                    )}
                  >
                    {formatDate(invoice.dueDate)}
                    {isOverdue(invoice.status, invoice.dueDate) ? (
                      <span className="ml-1.5 text-xs">
                        ({daysOverdue(invoice.dueDate)}d overdue)
                      </span>
                    ) : null}
                  </Link>
                </TableCell>
                <TableCell className="p-0">
                  <Link
                    href={`/invoices/${invoice.id}`}
                    className="block p-2 text-right tabular-figures font-medium"
                  >
                    {formatCurrency(invoice.total, invoice.currency)}
                  </Link>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
