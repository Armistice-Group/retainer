import Link from "next/link";
import { notFound } from "next/navigation";
import { Download, ScrollText } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireOrgContext } from "@/lib/org-context";
import {
  AUDIT_ENTITY_TYPES,
  AUDIT_PAGE_SIZE,
  auditEntityHref,
  describeAudit,
  findAuditEntries,
  formatAuditChanges,
  humanizeType,
  parseAuditFilters,
} from "@/lib/audit-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmptyState } from "@/components/empty-state";

const selectClass = "h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm";

export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { org, role } = await requireOrgContext();
  if (role !== "OWNER" && role !== "ADMIN") notFound();

  const params = await searchParams;
  const filters = parseAuditFilters(params);
  const page = Math.max(0, Number.parseInt(params.page ?? "0", 10) || 0);

  const [rows, members, projects, clients] = await Promise.all([
    findAuditEntries(org.id, filters, {
      skip: page * AUDIT_PAGE_SIZE,
      take: AUDIT_PAGE_SIZE + 1,
    }),
    prisma.membership.findMany({
      where: { orgId: org.id },
      include: { user: { select: { id: true, name: true } } },
      orderBy: { user: { name: "asc" } },
    }),
    prisma.project.findMany({ where: { orgId: org.id }, select: { id: true, name: true } }),
    prisma.client.findMany({ where: { orgId: org.id }, select: { id: true, name: true } }),
  ]);
  const hasMore = rows.length > AUDIT_PAGE_SIZE;
  const entries = rows.slice(0, AUDIT_PAGE_SIZE);
  // Changes store ids (assignee, project, client); show names where we can.
  const names = new Map([
    ...members.map((m) => [m.user.id, m.user.name] as const),
    ...projects.map((p) => [p.id, p.name] as const),
    ...clients.map((c) => [c.id, c.name] as const),
  ]);

  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) if (value) query.set(key, value);
  const pageHref = (n: number) => {
    const q = new URLSearchParams(query);
    if (n > 0) q.set("page", String(n));
    const qs = q.toString();
    return qs ? `/settings/audit?${qs}` : "/settings/audit";
  };
  const filtered = query.toString() !== "";

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="text-base">Audit log</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              Every change to clients, projects, tasks, time, invoices, members and settings —
              who made it, when, and from where.
            </p>
          </div>
          <Button variant="outline" size="sm" asChild>
            <a href={`/settings/audit/export${query.size ? `?${query}` : ""}`}>
              <Download />
              Export CSV
            </a>
          </Button>
        </CardHeader>
        <CardContent>
          <form method="get" className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="actor">Who</Label>
              <select id="actor" name="actor" defaultValue={filters.actor} className={selectClass}>
                <option value="">Everyone</option>
                {members.map((m) => (
                  <option key={m.user.id} value={m.user.id}>
                    {m.user.name}
                  </option>
                ))}
                <option value="system">System</option>
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="action">Action</Label>
              <select
                id="action"
                name="action"
                defaultValue={filters.action}
                className={selectClass}
              >
                <option value="">Any</option>
                <option value="create">Created</option>
                <option value="update">Updated</option>
                <option value="delete">Deleted</option>
                <option value="sign_in">Signed in</option>
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="type">Record</Label>
              <select id="type" name="type" defaultValue={filters.type} className={selectClass}>
                <option value="">Any</option>
                {AUDIT_ENTITY_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {humanizeType(t)}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="from">From</Label>
              <Input id="from" name="from" type="date" defaultValue={filters.from} className="w-36" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="to">To</Label>
              <Input id="to" name="to" type="date" defaultValue={filters.to} className="w-36" />
            </div>
            <Button type="submit" size="sm" className="h-8">
              Filter
            </Button>
            {filtered ? (
              <Link
                href="/settings/audit"
                className="h-8 content-center text-sm text-muted-foreground hover:text-foreground"
              >
                Clear
              </Link>
            ) : null}
          </form>
        </CardContent>
      </Card>

      <Card className="gap-0 py-0">
        {entries.length === 0 ? (
          <EmptyState
            icon={ScrollText}
            title={filtered || page > 0 ? "No matching activity" : "No activity yet"}
            description={
              filtered
                ? "Try a wider date range or a different filter."
                : "Changes made from now on show up here."
            }
          />
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {entries.map((entry) => {
              const href = auditEntityHref(entry);
              const changes = formatAuditChanges(entry.changes, names);
              return (
                <li key={entry.id} className="flex flex-col gap-1 px-4 py-3 text-sm sm:px-6">
                  <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-1">
                    <span className="font-medium">
                      {entry.actor?.name ?? (entry.via === "system" ? "System" : "Unknown user")}
                    </span>
                    <span className="text-muted-foreground">{describeAudit(entry)}</span>
                    {entry.entityLabel && entry.action !== "sign_in" ? (
                      href ? (
                        <Link href={href} className="min-w-0 truncate hover:underline">
                          {entry.entityLabel}
                        </Link>
                      ) : (
                        <span className="min-w-0 truncate">{entry.entityLabel}</span>
                      )
                    ) : null}
                    {entry.via === "api" ? (
                      <Badge variant="outline" className="text-[0.7rem]">
                        API
                      </Badge>
                    ) : null}
                    <time
                      dateTime={entry.createdAt.toISOString()}
                      title={entry.createdAt.toISOString()}
                      className="tabular-figures ml-auto shrink-0 text-xs text-muted-foreground"
                    >
                      {entry.createdAt.toLocaleString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                        timeZone: "UTC",
                        timeZoneName: "short",
                      })}
                    </time>
                  </div>
                  {changes.length > 0 ? (
                    <details className="group text-xs text-muted-foreground">
                      <summary className="cursor-pointer select-none hover:text-foreground">
                        {changes.length === 1
                          ? changes[0].field
                          : `${changes.length} fields`}
                      </summary>
                      <dl className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-md bg-muted/50 p-2">
                        {changes.map((c) => (
                          <div key={c.field} className="contents">
                            <dt className="font-medium text-foreground">{c.field}</dt>
                            <dd className="min-w-0 break-words">
                              {c.from !== undefined ? (
                                <>
                                  <span className="line-through">{c.from}</span>
                                  {" → "}
                                </>
                              ) : null}
                              {c.to}
                            </dd>
                          </div>
                        ))}
                      </dl>
                    </details>
                  ) : null}
                  {entry.ipAddress ? (
                    <p className="truncate text-xs text-muted-foreground" title={entry.userAgent ?? ""}>
                      {entry.ipAddress}
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {page > 0 || hasMore ? (
        <div className="flex items-center justify-between text-sm">
          {page > 0 ? (
            <Link href={pageHref(page - 1)} className="text-muted-foreground hover:text-foreground">
              ← Newer
            </Link>
          ) : (
            <span />
          )}
          {hasMore ? (
            <Link href={pageHref(page + 1)} className="text-muted-foreground hover:text-foreground">
              Older →
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
