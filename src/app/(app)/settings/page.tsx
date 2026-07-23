import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireOrgContext } from "@/lib/org-context";
import { prisma } from "@/lib/prisma";
import { OrgSettingsForm } from "./org-settings-form";
import { QuickBooksCard } from "./quickbooks-card";

export default async function OrgSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ quickbooks?: string }>;
}) {
  const { org, role } = await requireOrgContext();
  const readOnly = role === "MEMBER";
  const { quickbooks } = await searchParams;

  const connection = await prisma.quickBooksConnection.findUnique({ where: { orgId: org.id } });

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
    </div>
  );
}
