import Link from "next/link";
import { Building2, CalendarCheck, Plus, Upload, UserRoundPlus } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireOrgContext } from "@/lib/org-context";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/empty-state";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/format";
import { DISCARD_PURGE_DAYS } from "@/lib/services/scheduling";
import type { Prisma } from "@/generated/prisma/client";

export default async function ClientsPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const { org, role } = await requireOrgContext();
  const canManage = role === "OWNER" || role === "ADMIN";
  const { view: rawView } = await searchParams;
  const view = rawView === "drafts" ? "drafts" : rawView === "discarded" && canManage ? "discarded" : "clients";

  const where: Prisma.ClientWhereInput =
    view === "drafts"
      ? { orgId: org.id, status: "LEAD", leadDiscardedAt: null }
      : view === "discarded"
        ? { orgId: org.id, status: "LEAD", leadDiscardedAt: { not: null } }
        : { orgId: org.id, status: { not: "LEAD" } };

  const [clients, draftCount, discardedCount] = await Promise.all([
    prisma.client.findMany({
      where,
      include: {
        _count: { select: { projects: true } },
        bookings: {
          where: { status: "SCHEDULED", endAt: { gt: new Date() } },
          orderBy: { startAt: "asc" },
          take: 1,
          select: { startAt: true },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.client.count({ where: { orgId: org.id, status: "LEAD", leadDiscardedAt: null } }),
    canManage
      ? prisma.client.count({ where: { orgId: org.id, status: "LEAD", leadDiscardedAt: { not: null } } })
      : Promise.resolve(0),
  ]);

  const tabs = [
    { href: "/clients", label: "Clients", active: view === "clients", count: 0 },
    { href: "/clients?view=drafts", label: "Drafts", active: view === "drafts", count: draftCount },
    ...(canManage && (discardedCount > 0 || view === "discarded")
      ? [{ href: "/clients?view=discarded", label: "Discarded", active: view === "discarded", count: 0 }]
      : []),
  ];

  return (
    <div>
      <PageHeader
        title="Clients"
        description={
          view === "clients"
            ? "Everyone you do work for, with their contacts and projects."
            : view === "drafts"
              ? "People who booked a call through Cal.com or Calendly and aren't clients yet. Make each a client, merge it into one, or discard it."
              : `Discarded drafts. Each is deleted ${DISCARD_PURGE_DAYS} days after it was discarded, unless you restore it.`
        }
        actions={
          <>
            <Button variant="outline" asChild>
              <Link href="/clients/import">
                <Upload className="size-4" /> Import
              </Link>
            </Button>
            <Button asChild>
              <Link href="/clients/new">
                <Plus className="size-4" /> Add client
              </Link>
            </Button>
          </>
        }
      />

      <div className="mb-4 flex gap-1 overflow-x-auto border-b border-border">
        {tabs.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={tab.active ? "page" : undefined}
            className={cn(
              "flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors",
              tab.active
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {tab.label}
            {tab.count > 0 ? <Badge className="h-4 px-1.5 text-[0.65rem]">{tab.count}</Badge> : null}
          </Link>
        ))}
      </div>

      {clients.length === 0 ? (
        view === "clients" ? (
          <EmptyState
            icon={Building2}
            title="No clients yet"
            description="Add your first client to start organizing projects and time under them."
            action={
              <Button asChild size="sm">
                <Link href="/clients/new">
                  <Plus className="size-4" /> Add client
                </Link>
              </Button>
            }
          />
        ) : (
          <EmptyState
            icon={UserRoundPlus}
            title={view === "drafts" ? "No draft clients" : "Nothing discarded"}
            description={
              view === "drafts"
                ? "When someone new books a call through Cal.com or Calendly, they show up here for you to review."
                : "Discarded drafts show up here until they're deleted."
            }
            action={
              view === "drafts" && canManage ? (
                <Button asChild size="sm" variant="outline">
                  <Link href="/settings/scheduling">Connect Cal.com or Calendly</Link>
                </Button>
              ) : undefined
            }
          />
        )
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {clients.map((client) => (
            <Link key={client.id} href={`/clients/${client.id}`}>
              <Card className="h-full gap-2 p-5 transition-colors hover:border-foreground/20">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-medium">{client.name}</p>
                  <StatusBadge status={client.status} />
                </div>
                {client.status === "LEAD" ? (
                  <p className="text-sm text-muted-foreground">
                    {client.leadSource ? `From ${client.leadSource}` : "Draft"}
                    {client.leadBookedAt ? ` · booked ${formatDate(client.leadBookedAt)}` : ""}
                    {client.email ? ` · ${client.email}` : ""}
                  </p>
                ) : client.description ? (
                  <p className="line-clamp-2 text-sm text-muted-foreground">{client.description}</p>
                ) : null}
                <p className="mt-2 flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
                  {client.status === "LEAD" ? null : (
                    <span>
                      {client._count.projects} project{client._count.projects === 1 ? "" : "s"}
                    </span>
                  )}
                  {client.bookings[0] ? (
                    <span className="flex items-center gap-1">
                      <CalendarCheck className="size-3" /> Call {formatDate(client.bookings[0].startAt)}
                    </span>
                  ) : null}
                </p>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
