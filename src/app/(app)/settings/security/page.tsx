import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireOrgContext } from "@/lib/org-context";
import { prisma } from "@/lib/prisma";
import { OrgSecurityForm } from "../org-security-form";
import { SsoCard } from "../sso-card";
import { getRequestOrigin } from "@/lib/url";
import { SSO_CALLBACK_PATH } from "@/lib/integrations/sso";

export default async function OrgSecurityPage() {
  const { org, role } = await requireOrgContext();
  const readOnly = role === "MEMBER";

  const ssoConnection = await prisma.ssoConnection.findUnique({ where: { orgId: org.id } });
  const origin = await getRequestOrigin();

  return (
    <div className="grid items-start gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Domain</CardTitle>
        </CardHeader>
        <CardContent>
          <OrgSecurityForm
            org={{ domain: org.domain, autoJoinDomain: org.autoJoinDomain }}
            readOnly={readOnly}
          />
        </CardContent>
      </Card>

      <SsoCard
        connection={
          ssoConnection
            ? {
                issuer: ssoConnection.issuer,
                clientId: ssoConnection.clientId,
                displayName: ssoConnection.displayName,
                allowedDomains: ssoConnection.allowedDomains,
                autoProvision: ssoConnection.autoProvision,
                defaultRole: ssoConnection.defaultRole,
                enforced: ssoConnection.enforced,
                trustEmails: ssoConnection.trustEmails,
                enabled: ssoConnection.enabled,
              }
            : null
        }
        callbackUrl={`${origin}${SSO_CALLBACK_PATH}`}
        readOnly={readOnly}
      />
    </div>
  );
}
