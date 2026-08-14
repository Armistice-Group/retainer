import { requireOrgContext } from "@/lib/org-context";
import { prisma } from "@/lib/prisma";
import { QuickBooksCard } from "../quickbooks-card";
import { LinearCard } from "../linear-card";

export default async function IntegrationsPage({
  searchParams,
}: {
  searchParams: Promise<{ quickbooks?: string; linear?: string }>;
}) {
  const { org, role } = await requireOrgContext();
  const readOnly = role === "MEMBER";
  const { quickbooks, linear } = await searchParams;

  const connection = await prisma.quickBooksConnection.findUnique({ where: { orgId: org.id } });
  const linearConnection = await prisma.linearConnection.findUnique({ where: { orgId: org.id } });

  return (
    <div className="grid items-start gap-6 lg:grid-cols-2">
      <QuickBooksCard
        connected={!!connection}
        realmId={connection?.realmId ?? null}
        readOnly={readOnly}
        callbackStatus={quickbooks}
      />

      <LinearCard
        connected={!!linearConnection}
        workspaceName={linearConnection?.workspaceName ?? null}
        readOnly={readOnly}
        callbackStatus={linear}
      />
    </div>
  );
}
