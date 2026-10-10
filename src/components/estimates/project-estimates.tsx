import Link from "next/link";
import { FileSignature } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { formatCurrency } from "@/lib/format";
import { StatusBadge } from "@/components/status-badge";
import type { Role } from "@/generated/prisma/client";
import { estimateVisibilityWhere } from "@/lib/services/estimates";

/** On a project page: the estimate it was created from, and any estimates
 * written for it. Renders nothing if there are none. */
export async function ProjectEstimates({
  projectId,
  orgId,
  userId,
  role,
}: {
  projectId: string;
  orgId: string;
  userId: string;
  role: Role;
}) {
  const estimates = await prisma.estimate.findMany({
    where: { projectId, orgId, ...estimateVisibilityWhere(userId, role) },
    select: {
      id: true,
      number: true,
      title: true,
      status: true,
      total: true,
      currency: true,
      projectCreatedAt: true,
    },
    orderBy: { createdAt: "asc" },
  });
  if (estimates.length === 0) return null;

  return (
    <div className="mb-6 flex flex-col gap-1.5">
      {estimates.map((e) => (
        <p key={e.id} className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <FileSignature className="size-3.5" />
          {e.projectCreatedAt ? "Created from estimate" : "Estimate"}
          <Link href={`/estimates/${e.id}`} className="font-medium text-foreground hover:underline">
            {e.number} · {e.title}
          </Link>
          <span className="tabular-figures">{formatCurrency(e.total, e.currency)}</span>
          <StatusBadge status={e.status} />
        </p>
      ))}
    </div>
  );
}
