import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireOrgContext } from "@/lib/org-context";
import { OrgSettingsForm } from "./org-settings-form";
import { OrgLogoCard } from "./org-logo-card";
import { InstanceUrlCard } from "./instance-url-card";
import { getConfiguredPublicUrl, getRequestOrigin } from "@/lib/url";

export default async function OrgSettingsPage() {
  const { org, role } = await requireOrgContext();
  const readOnly = role === "MEMBER";

  const [configuredUrl, currentUrl] = await Promise.all([
    getConfiguredPublicUrl(),
    getRequestOrigin(),
  ]);

  const previewSrc = org.logoData
    ? `data:${org.logoContentType};base64,${Buffer.from(org.logoData).toString("base64")}`
    : org.logoUrl;

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[2fr_1fr]">
      <div className="flex flex-col gap-6">
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
                overheadPercent: org.overheadPercent.toString(),
                expenseApprovalThreshold: org.expenseApprovalThreshold.toString(),
                externalBillingLabel: org.externalBillingLabel,
                externalBillingUrl: org.externalBillingUrl,
                slackWebhookUrl: org.slackWebhookUrl,
                brandColor: org.brandColor,
              }}
              readOnly={readOnly}
            />
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col gap-6">
        <OrgLogoCard
          previewSrc={previewSrc}
          readOnly={readOnly}
          appBranding={org.appBranding}
          appAccentFromBrand={org.appAccentFromBrand}
          brandColor={/^#[0-9a-fA-F]{6}$/.test(org.brandColor ?? "") ? org.brandColor : null}
        />
        {role === "OWNER" ? (
          <InstanceUrlCard
            configuredUrl={configuredUrl}
            currentUrl={currentUrl}
            envOverride={process.env.AUTH_URL ? new URL(process.env.AUTH_URL).origin : null}
          />
        ) : null}
      </div>
    </div>
  );
}
