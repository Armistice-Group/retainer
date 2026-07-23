import Link from "next/link";
import { Building2, Plus } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireOrgContext } from "@/lib/org-context";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/empty-state";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default async function ClientsPage() {
  const { org } = await requireOrgContext();

  const clients = await prisma.client.findMany({
    where: { orgId: org.id },
    include: { _count: { select: { projects: true } } },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div>
      <PageHeader
        title="Clients"
        description="Everyone you do work for, with their contacts and projects."
        actions={
          <Button asChild>
            <Link href="/clients/new">
              <Plus className="size-4" /> Add client
            </Link>
          </Button>
        }
      />

      {clients.length === 0 ? (
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
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {clients.map((client) => (
            <Link key={client.id} href={`/clients/${client.id}`}>
              <Card className="h-full gap-2 p-5 transition-colors hover:border-primary/40">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-medium">{client.name}</p>
                  <StatusBadge status={client.status} />
                </div>
                {client.description ? (
                  <p className="line-clamp-2 text-sm text-muted-foreground">
                    {client.description}
                  </p>
                ) : null}
                <p className="mt-2 text-xs text-muted-foreground">
                  {client._count.projects} project{client._count.projects === 1 ? "" : "s"}
                </p>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
