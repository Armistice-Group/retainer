import Link from "next/link";
import { FileSignature, Plus } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireOrgContext } from "@/lib/org-context";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/empty-state";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCurrency, formatDate } from "@/lib/format";
import { canManageEstimates, estimateVisibilityWhere, expireEstimates } from "@/lib/services/estimates";

export default async function EstimatesPage() {
  const { org, user, role } = await requireOrgContext();
  const canManage = canManageEstimates(role);
  await expireEstimates({ orgId: org.id });

  const estimates = await prisma.estimate.findMany({
    where: { orgId: org.id, ...estimateVisibilityWhere(user.id, role) },
    include: { client: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
  });

  const newButton = canManage ? (
    <Button asChild>
      <Link href="/estimates/new">
        <Plus className="size-4" /> New estimate
      </Link>
    </Button>
  ) : null;

  return (
    <div>
      <PageHeader
        title="Estimates"
        description="Quote a client, send it for them to accept, then turn it into a project."
        actions={newButton}
      />

      {estimates.length === 0 ? (
        <EmptyState
          icon={FileSignature}
          title="No estimates yet"
          description={
            canManage
              ? "Write an estimate with line items and scope, send it, and the client accepts or declines it online."
              : "Owners and admins write estimates. You'll see them here once there are some."
          }
          action={newButton}
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Number</TableHead>
              <TableHead>Title</TableHead>
              <TableHead>Client</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Valid until</TableHead>
              <TableHead className="text-right">Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {estimates.map((e) => {
              const href = `/estimates/${e.id}`;
              return (
                <TableRow key={e.id} className="cursor-pointer">
                  <TableCell className="p-0">
                    <Link href={href} className="block p-2 font-medium hover:underline">
                      {e.number}
                    </Link>
                  </TableCell>
                  <TableCell className="p-0">
                    <Link href={href} className="block max-w-xs truncate p-2">
                      {e.title}
                    </Link>
                  </TableCell>
                  <TableCell className="p-0">
                    <Link href={href} className="block p-2">
                      {e.client.name}
                    </Link>
                  </TableCell>
                  <TableCell className="p-0">
                    <Link href={href} className="block p-2">
                      <StatusBadge status={e.status} />
                    </Link>
                  </TableCell>
                  <TableCell className="p-0">
                    <Link href={href} className="tabular-figures block p-2 text-muted-foreground">
                      {e.expiresAt ? formatDate(e.expiresAt) : "No expiry"}
                    </Link>
                  </TableCell>
                  <TableCell className="p-0">
                    <Link href={href} className="tabular-figures block p-2 text-right font-medium">
                      {formatCurrency(e.total, e.currency)}
                    </Link>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
