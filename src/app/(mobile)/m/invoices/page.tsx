import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireOrgContext } from "@/lib/org-context";
import { invoiceVisibilityWhere } from "@/lib/project-access";
import { AdminOnlyNotice } from "@/components/admin-only-notice";
import { balanceDue } from "@/lib/invoice-balance";
import { daysOverdue, isOverdue } from "@/lib/invoice-aging";
import { formatCurrency, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Owed" };

/** What clients owe: sent invoices with a balance, overdue first. Tapping
 * one opens it in the full app (record a payment, send a reminder). */
export default async function PhoneOwedPage() {
  const { org, user, role } = await requireOrgContext();
  if (role !== "OWNER" && role !== "ADMIN") return <AdminOnlyNotice what="invoices" />;

  const [invoices, drafts] = await Promise.all([
    prisma.invoice.findMany({
      where: { orgId: org.id, status: "SENT", ...invoiceVisibilityWhere(user.id, role) },
      include: { client: { select: { name: true } } },
      orderBy: { dueDate: "asc" },
    }),
    prisma.invoice.count({ where: { orgId: org.id, status: "DRAFT", ...invoiceVisibilityWhere(user.id, role) } }),
  ]);

  const now = new Date();
  const open = invoices
    .map((inv) => ({ ...inv, balance: balanceDue(inv), overdue: isOverdue(inv.status, inv.dueDate, now) }))
    .filter((inv) => inv.balance > 0);
  // Totals per currency: adding dollars to euros means nothing.
  const totals = new Map<string, { owed: number; overdue: number }>();
  for (const inv of open) {
    const t = totals.get(inv.currency) ?? { owed: 0, overdue: 0 };
    t.owed += inv.balance;
    if (inv.overdue) t.overdue += inv.balance;
    totals.set(inv.currency, t);
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-medium">Owed</h1>

      {totals.size ? (
        [...totals.entries()].map(([currency, t]) => (
          <div key={currency} className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-border bg-card p-3">
              <p className="text-xs text-muted-foreground">Outstanding</p>
              <p className="tabular-figures text-xl font-medium">{formatCurrency(t.owed, currency)}</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-3">
              <p className="text-xs text-muted-foreground">Overdue</p>
              <p className={cn("tabular-figures text-xl font-medium", t.overdue > 0 && "text-destructive")}>
                {formatCurrency(t.overdue, currency)}
              </p>
            </div>
          </div>
        ))
      ) : (
        <p className="py-6 text-center text-sm text-muted-foreground">Nothing outstanding. Every sent invoice is paid.</p>
      )}

      {open.length ? (
        <ul className="divide-y divide-border rounded-xl border border-border bg-card">
          {[...open.filter((i) => i.overdue), ...open.filter((i) => !i.overdue)].map((inv) => (
            <li key={inv.id}>
              <Link href={`/invoices/${inv.id}`} className="flex items-center gap-3 p-3 hover:bg-muted/50">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{inv.client.name}</span>
                  <span className={cn("block text-xs", inv.overdue ? "text-destructive" : "text-muted-foreground")}>
                    {inv.number} ·{" "}
                    {inv.overdue ? `${daysOverdue(inv.dueDate, now)} days overdue` : `due ${formatDate(inv.dueDate)}`}
                  </span>
                </span>
                <span className="tabular-figures text-sm font-medium">{formatCurrency(inv.balance, inv.currency)}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}

      {drafts ? (
        <Link href="/invoices?status=draft" className="text-sm text-brand">
          {drafts === 1 ? "1 draft" : `${drafts} drafts`} waiting to be sent
        </Link>
      ) : null}
    </div>
  );
}
