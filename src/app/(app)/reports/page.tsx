import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, Download } from "lucide-react";
import { requireOrgContext } from "@/lib/org-context";
import { buildReport, reportRangeFromParams } from "@/lib/services/reports";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";

const PRESETS = [
  { key: "month", label: "This month" },
  { key: "last-month", label: "Last month" },
  { key: "quarter", label: "This quarter" },
  { key: "ytd", label: "Year to date" },
  { key: "12m", label: "Last 12 months" },
];

const pct = (n: number | null) => (n === null ? "—" : `${Math.round(n * 100)}%`);
const iso = (d: Date) => d.toISOString().slice(0, 10);

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; from?: string; to?: string }>;
}) {
  const { org, role } = await requireOrgContext();
  if (role !== "OWNER" && role !== "ADMIN") notFound();
  const params = await searchParams;
  const range = reportRangeFromParams(params);
  const report = await buildReport(org.id, range.from, range.to);
  const money = (n: number) => formatCurrency(n, org.defaultCurrency);
  const lastDay = new Date(range.to.getTime() - 86_400_000);
  const query = `from=${iso(range.from)}&to=${iso(lastDay)}`;

  const totals = report.projects.reduce(
    (t, p) => ({
      invoiced: t.invoiced + p.invoiced,
      labor: t.labor + p.laborCost,
      expenses: t.expenses + p.expenses,
      profit: t.profit + p.profit,
      value: t.value + p.billableValue,
    }),
    { invoiced: 0, labor: 0, expenses: 0, profit: 0, value: 0 }
  );
  const hours = report.people.reduce((s, p) => s + p.hours, 0);
  const billable = report.people.reduce((s, p) => s + p.billableHours, 0);
  const missingCost = report.projects.some((p) => p.missingCost);
  // Cash received in range, by the date each payment arrived.
  const receivedHere = report.received.find((r) => r.currency === org.defaultCurrency);
  const receivedOther = report.received.filter((r) => r.currency !== org.defaultCurrency);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Reports"
        description={`${iso(range.from)} to ${iso(lastDay)} · Utilization, profit, unbilled work and receivables.`}
      />

      <div className="flex flex-wrap items-end gap-3">
        <div className="inline-flex flex-wrap rounded-md border border-border p-0.5">
          {PRESETS.map((p) => (
            <Link
              key={p.key}
              href={`/reports?range=${p.key}`}
              aria-current={range.preset === p.key ? "page" : undefined}
              className={cn(
                "rounded px-2.5 py-1 text-sm transition-colors",
                range.preset === p.key
                  ? "bg-accent font-medium text-accent-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {p.label}
            </Link>
          ))}
        </div>
        <form method="get" className="flex flex-wrap items-center gap-2">
          <Input type="date" name="from" defaultValue={iso(range.from)} className="h-8 w-36" aria-label="From" />
          <span className="text-sm text-muted-foreground">to</span>
          <Input type="date" name="to" defaultValue={iso(lastDay)} className="h-8 w-36" aria-label="To" />
          <Button type="submit" size="sm" variant="outline" className="h-8">
            Apply
          </Button>
        </form>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Stat label="Hours logged" value={hours.toFixed(1)} sub={`${billable.toFixed(1)} billable`} />
        <Stat label="Invoiced" value={money(totals.invoiced)} sub={`${money(totals.value)} of billable time logged`} />
        <Stat
          label="Profit"
          value={money(totals.profit)}
          sub={totals.invoiced > 0 ? `${pct(totals.profit / totals.invoiced)} margin` : "Nothing invoiced yet"}
        />
        <Stat
          label="Received"
          value={money(receivedHere?.amount ?? 0)}
          sub={
            receivedOther.length
              ? `Also ${receivedOther.map((r) => formatCurrency(r.amount, r.currency)).join(", ")}`
              : `${receivedHere?.count ?? 0} payment${receivedHere?.count === 1 ? "" : "s"} in range`
          }
        />
        <Stat
          label="Outstanding"
          value={money(report.aging.reduce((s, r) => s + r.total, 0))}
          sub={`${money(report.unbilled.reduce((s, r) => s + r.total, 0))} not yet invoiced`}
        />
      </div>

      {missingCost ? (
        <p className="flex items-start gap-2 rounded-lg border border-border px-4 py-3 text-sm text-muted-foreground">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>
            Some time was logged by people without an hourly cost, so profit is overstated. Set
            costs under{" "}
            <Link href="/settings/members" className="text-brand hover:underline">
              Settings → Members
            </Link>
            .
          </span>
        </p>
      ) : null}

      <Section
        title="Utilization"
        hint={`Billable hours against ${report.capacity}h of capacity (8h per weekday).`}
        exportHref={`/reports/export?section=people&${query}`}
      >
        <Table
          head={["Person", "Hours", "Billable", "Utilization", "Billable value", "Cost"]}
          rows={report.people.map((p) => [
            p.name,
            p.hours.toFixed(2),
            p.billableHours.toFixed(2),
            pct(p.utilization),
            money(p.billableValue),
            p.cost === null ? "—" : money(p.cost),
          ])}
          empty="No time logged in this range."
        />
      </Section>

      <Section
        title="Profit by project"
        hint="Invoiced (sent or paid, issued in range) minus labor cost and approved expenses in range."
        exportHref={`/reports/export?section=projects&${query}`}
      >
        <Table
          head={["Project", "Hours", "Invoiced", "Labor", "Expenses", "Profit", "Margin"]}
          rows={report.projects.map((p) => [
            <Link key={p.projectId} href={`/projects/${p.projectId}`} className="hover:underline">
              <span className="text-muted-foreground">{p.client} — </span>
              {p.project}
            </Link>,
            p.hours.toFixed(2),
            money(p.invoiced),
            `${money(p.laborCost)}${p.missingCost ? "*" : ""}`,
            money(p.expenses),
            <span key="profit" className={p.profit < 0 ? "text-destructive" : undefined}>
              {money(p.profit)}
            </span>,
            pct(p.margin),
          ])}
          empty="No project activity in this range."
        />
      </Section>

      <div className="flex flex-col gap-6">
        <Section
          title="Unbilled work"
          hint="Billable time, completed milestones and approved expenses not on an invoice yet (all time)."
          exportHref={`/reports/export?section=unbilled&${query}`}
        >
          <Table
            head={["Client", "Hours", "Total"]}
            rows={report.unbilled.map((u) => [
              <Link key={u.clientId} href={`/invoices/new?clientId=${u.clientId}`} className="hover:underline">
                {u.client}
              </Link>,
              u.hours.toFixed(2),
              money(u.total),
            ])}
            empty="Everything is invoiced."
          />
        </Section>
        <Section
          title="Receivables"
          hint="Balance still due on sent invoices (after part payments and credit), by days overdue."
          exportHref={`/reports/export?section=aging&${query}`}
        >
          <Table
            head={["Client", "Current", "1–30", "31–60", "61–90", "90+"]}
            rows={report.aging.map((a) => [
              <Link key={a.clientId} href={`/clients/${a.clientId}`} className="hover:underline">
                {a.client}
              </Link>,
              money(a.current),
              money(a.d1to30),
              money(a.d31to60),
              money(a.d61to90),
              <span key="90" className={a.over90 > 0 ? "text-destructive" : undefined}>
                {money(a.over90)}
              </span>,
            ])}
            empty="No outstanding invoices."
          />
        </Section>
      </div>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="tabular-figures text-2xl font-semibold">{value}</p>
        <p className="mt-1 text-xs text-muted-foreground">{sub}</p>
      </CardContent>
    </Card>
  );
}

function Section({
  title,
  hint,
  exportHref,
  children,
}: {
  title: string;
  hint: string;
  exportHref: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="gap-0 pb-0">
      <CardHeader className="flex flex-row items-start justify-between gap-2">
        <div>
          <CardTitle className="text-base">{title}</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
        </div>
        <Button variant="ghost" size="sm" asChild>
          <a href={exportHref}>
            <Download /> CSV
          </a>
        </Button>
      </CardHeader>
      <CardContent className="overflow-x-auto px-0 pt-3">{children}</CardContent>
    </Card>
  );
}

function Table({
  head,
  rows,
  empty,
}: {
  head: string[];
  rows: React.ReactNode[][];
  empty: string;
}) {
  if (rows.length === 0) {
    return <p className="px-6 pb-6 text-sm text-muted-foreground">{empty}</p>;
  }
  return (
    <table className="w-full min-w-[520px] text-sm">
      <thead>
        <tr className="border-b border-border text-xs text-muted-foreground">
          {head.map((h, i) => (
            <th key={h} className={cn("px-6 py-2 font-medium", i === 0 ? "text-left" : "text-right")}>
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="divide-y divide-border">
        {rows.map((cells, r) => (
          <tr key={r}>
            {cells.map((c, i) => (
              <td
                key={i}
                className={cn("px-6 py-2.5", i === 0 ? "text-left" : "tabular-figures text-right")}
              >
                {c}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
