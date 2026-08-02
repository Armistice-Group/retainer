import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireOrgContext } from "@/lib/org-context";
import { prisma } from "@/lib/prisma";
import { OrgSecurityForm } from "../org-security-form";
import { SsoCard } from "../sso-card";

export default async function OrgSecurityPage() {
  const { org, role } = await requireOrgContext();
  const readOnly = role === "MEMBER";

  const ssoConnection = await prisma.ssoConnection.findUnique({ where: { orgId: org.id } });

  return (
    <div className="flex max-w-2xl flex-col gap-6">
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
        connected={!!ssoConnection}
        issuer={ssoConnection?.issuer ?? null}
        enabled={ssoConnection?.enabled ?? false}
        readOnly={readOnly}
      />
    </div>
  );
}
