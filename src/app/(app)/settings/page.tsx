import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireOrgContext } from "@/lib/org-context";
import { prisma } from "@/lib/prisma";
import { OrgSettingsForm } from "./org-settings-form";
import { QuickBooksCard } from "./quickbooks-card";
import { GithubCard } from "./github-card";
import { LinearCard } from "./linear-card";
import { LaurelCard } from "./laurel-card";
import { SsoCard } from "./sso-card";

export default async function OrgSettingsPage({
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
  const ssoConnection = await prisma.ssoConnection.findUnique({ where: { orgId: org.id } });

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Organization</CardTitle>
        </CardHeader>
        <CardContent>
          <OrgSettingsForm
            org={{
              name: org.name,
              invoicePrefix: org.invoicePrefix,
              defaultCurrency: org.defaultCurrency,
              defaultTaxRate: org.defaultTaxRate.toString(),
              externalBillingLabel: org.externalBillingLabel,
              externalBillingUrl: org.externalBillingUrl,
              slackWebhookUrl: org.slackWebhookUrl,
              domain: org.domain,
              autoJoinDomain: org.autoJoinDomain,
              logoUrl: org.logoUrl,
              brandColor: org.brandColor,
            }}
            readOnly={readOnly}
          />
        </CardContent>
      </Card>

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

      <SsoCard
        connected={!!ssoConnection}
        issuer={ssoConnection?.issuer ?? null}
        enabled={ssoConnection?.enabled ?? false}
        readOnly={readOnly}
      />
    </div>
  );
}
