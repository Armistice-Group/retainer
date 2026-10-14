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
import { Input } from "@/components/ui/input";
import { balanceDue } from "@/lib/invoice-balance";

const FILTERS = [
  { value: "all", label: "All" },
  { value: "draft", label: "Drafts" },
  { value: "outstanding", label: "Outstanding" },
  { value: "overdue", label: "Overdue" },
  { value: "paid", label: "Paid" },
  { value: "void", label: "Void" },
] as const;
type Filter = (typeof FILTERS)[number]["value"];

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string }>;
}) {
  const { org, user, role } = await requireOrgContext();
  const params = await searchParams;
  const filter: Filter = FILTERS.some((f) => f.value === params.status) ? (params.status as Filter) : "all";
  const q = (params.q ?? "").trim();

  const all = await prisma.invoice.findMany({
    where: { orgId: org.id, ...invoiceVisibilityWhere(user.id, role) },
    include: { client: true },
    orderBy: { createdAt: "desc" },
  });

  // Totals in the org's currency (an invoice in another currency is left
  // out of them, not converted).
  const sent = all.filter((i) => i.status === "SENT" && i.currency === org.defaultCurrency);
  const outstanding = sent.reduce((sum, i) => sum + balanceDue(i), 0);
  const overdueTotal = sent
    .filter((i) => isOverdue(i.status, i.dueDate))
    .reduce((sum, i) => sum + balanceDue(i), 0);
  const overdueCount = all.filter((i) => isOverdue(i.status, i.dueDate)).length;

  const needle = q.toLowerCase();
  const invoices = all.filter((i) => {
    const matches =
      filter === "all" ||
      (filter === "draft" && i.status === "DRAFT") ||
      (filter === "outstanding" && i.status === "SENT") ||
      (filter === "overdue" && isOverdue(i.status, i.dueDate)) ||
      (filter === "paid" && i.status === "PAID") ||
      (filter === "void" && i.status === "VOID");
    return (
      matches &&
      (!needle ||
        i.number.toLowerCase().includes(needle) ||
        i.client.name.toLowerCase().includes(needle) ||
        (i.poNumber ?? "").toLowerCase().includes(needle))
    );
  });
  const query = (next: { status?: Filter; q?: string }) => {
    const sp = new URLSearchParams();
    const status = next.status ?? filter;
    const text = next.q ?? q;
    if (status !== "all") sp.set("status", status);
    if (text) sp.set("q", text);
    const str = sp.toString();
    return str ? `/invoices?${str}` : "/invoices";
  };

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

      {all.length > 0 ? (
        <>
          <div className="mb-4 grid gap-3 sm:grid-cols-2">
            <Link href={query({ status: "outstanding" })} className="rounded-lg border border-border p-4 hover:border-foreground/20">
              <p className="text-xs text-muted-foreground">Outstanding</p>
              <p className="tabular-figures mt-1 text-xl font-semibold">
                {formatCurrency(outstanding, org.defaultCurrency)}
              </p>
            </Link>
            <Link href={query({ status: "overdue" })} className="rounded-lg border border-border p-4 hover:border-foreground/20">
              <p className="text-xs text-muted-foreground">
                Overdue{overdueCount ? ` · ${overdueCount} invoice${overdueCount === 1 ? "" : "s"}` : ""}
              </p>
              <p
                className={cn(
                  "tabular-figures mt-1 text-xl font-semibold",
                  overdueTotal > 0 && "text-destructive"
                )}
              >
                {formatCurrency(overdueTotal, org.defaultCurrency)}
              </p>
            </Link>
          </div>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex gap-1 overflow-x-auto">
              {FILTERS.map((f) => (
                <Link
                  key={f.value}
                  href={query({ status: f.value })}
                  aria-current={filter === f.value ? "page" : undefined}
                  className={cn(
                    "shrink-0 rounded-md px-2.5 py-1 text-sm",
                    filter === f.value
                      ? "bg-muted font-medium text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {f.label}
                </Link>
              ))}
            </div>
            <form action="/invoices" className="w-full sm:w-64">
              {filter !== "all" ? <input type="hidden" name="status" value={filter} /> : null}
              <Input name="q" type="search" placeholder="Search number, client or PO" defaultValue={q} aria-label="Search invoices" />
            </form>
          </div>
        </>
      ) : null}

      {all.length > 0 && invoices.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          No invoices match.{" "}
          <Link href="/invoices" className="text-foreground underline underline-offset-2">
            Show all
          </Link>
        </p>
      ) : invoices.length === 0 ? (
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
        <>
        <ul className="divide-y divide-border rounded-lg border border-border sm:hidden">
          {invoices.map((invoice) => (
            <li key={invoice.id}>
              <Link href={`/invoices/${invoice.id}`} className="flex items-start justify-between gap-3 p-3">
                <div className="min-w-0">
                  <p className="font-medium">{invoice.number}</p>
                  <p className="truncate text-sm text-muted-foreground">{invoice.client.name}</p>
                  <div className="mt-1">
                    <InvoiceStatusBadge invoice={invoice} />
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <p className="tabular-figures font-medium">{formatCurrency(invoice.total, invoice.currency)}</p>
                  <p
                    className={cn(
                      "text-xs",
                      isOverdue(invoice.status, invoice.dueDate) ? "text-destructive" : "text-muted-foreground"
                    )}
                  >
                    Due {formatDate(invoice.dueDate)}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
        <div className="hidden sm:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Number</TableHead>
              <TableHead>Client</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Due</TableHead>
              <TableHead className="text-right">Balance</TableHead>
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
                    className="block p-2 text-right tabular-figures text-muted-foreground"
                  >
                    {invoice.status === "SENT" ? formatCurrency(balanceDue(invoice), invoice.currency) : "—"}
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
        </div>
        </>
      )}
    </div>
  );
}
