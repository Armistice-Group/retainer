import { requireOrgContext } from "@/lib/org-context";
import { prisma } from "@/lib/prisma";
import { QuickBooksCard } from "../quickbooks-card";
import { LinearCard } from "../linear-card";
import { isLinearConfigured } from "@/lib/integrations/linear";
import { isQuickBooksConfigured } from "@/lib/integrations/quickbooks";
import { getRequestOrigin } from "@/lib/url";

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
  // OAuth redirects come back to the address the admin is browsing on.
  const origin = await getRequestOrigin();

  return (
    <div className="grid items-start gap-6 lg:grid-cols-2">
      <QuickBooksCard
        connected={!!connection}
        realmId={connection?.realmId ?? null}
        readOnly={readOnly}
        callbackStatus={quickbooks}
        configured={isQuickBooksConfigured()}
        callbackUrl={`${origin}/api/integrations/quickbooks/callback`}
      />

      <LinearCard
        connected={!!linearConnection}
        workspaceName={linearConnection?.workspaceName ?? null}
        readOnly={readOnly}
        callbackStatus={linear}
        configured={isLinearConfigured()}
        callbackUrl={`${origin}/api/integrations/linear/callback`}
      />
    </div>
  );
}
