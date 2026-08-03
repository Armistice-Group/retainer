import { requireOrgContext } from "@/lib/org-context";
import { prisma } from "@/lib/prisma";
import { QuickBooksCard } from "../quickbooks-card";
import { GithubCard } from "../github-card";
import { LinearCard } from "../linear-card";
import { LaurelCard } from "../laurel-card";

export default async function IntegrationsPage({
  searchParams,
}: {
  searchParams: Promise<{ quickbooks?: string; github?: string; linear?: string }>;
}) {
  const { org, role } = await requireOrgContext();
  const readOnly = role === "MEMBER";
  const { quickbooks, github, linear } = await searchParams;

  const connection = await prisma.quickBooksConnection.findUnique({ where: { orgId: org.id } });
  const githubConnection = await prisma.githubConnection.findUnique({ where: { orgId: org.id } });
  const linearConnection = await prisma.linearConnection.findUnique({ where: { orgId: org.id } });
  const laurelConnection = await prisma.laurelConnection.findUnique({ where: { orgId: org.id } });

  return (
    <div className="grid items-start gap-6 lg:grid-cols-2">
      <QuickBooksCard
        connected={!!connection}
        realmId={connection?.realmId ?? null}
        readOnly={readOnly}
        callbackStatus={quickbooks}
      />

      <GithubCard
        connected={!!githubConnection}
        login={githubConnection?.login ?? null}
        readOnly={readOnly}
        callbackStatus={github}
      />

      <LinearCard
        connected={!!linearConnection}
        workspaceName={linearConnection?.workspaceName ?? null}
        readOnly={readOnly}
        callbackStatus={linear}
      />

      <LaurelCard
        connected={!!laurelConnection}
        customerId={laurelConnection?.customerId ?? null}
        readOnly={readOnly}
      />
    </div>
  );
}
