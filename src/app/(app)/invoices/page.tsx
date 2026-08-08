import Link from "next/link";
import { FileText, Plus } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireOrgContext } from "@/lib/org-context";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/empty-state";
import { StatusBadge } from "@/components/status-badge";
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
  const { org } = await requireOrgContext();

  const invoices = await prisma.invoice.findMany({
    where: { orgId: org.id },
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
                <TableCell>
                  <Link href={`/invoices/${invoice.id}`} className="font-medium hover:underline">
                    {invoice.number}
                  </Link>
                </TableCell>
                <TableCell>{invoice.client.name}</TableCell>
                <TableCell>
                  <StatusBadge status={invoice.status} />
                </TableCell>
                <TableCell
                  className={cn(
                    "tabular-figures",
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
                </TableCell>
                <TableCell className="tabular-figures text-right font-medium">
                  {formatCurrency(invoice.total, invoice.currency)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
