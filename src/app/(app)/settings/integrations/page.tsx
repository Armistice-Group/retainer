import { requireOrgContext } from "@/lib/org-context";
import { prisma } from "@/lib/prisma";
import { QuickBooksCard } from "../quickbooks-card";
import { LinearCard } from "../linear-card";
import { EmailCard } from "../email-card";
import { IntegrationCredentials } from "../integration-credentials";
import { isLinearConfigured } from "@/lib/integrations/linear";
import { isQuickBooksConfigured } from "@/lib/integrations/quickbooks";
import { isEmailConfigured } from "@/lib/email";
import { describeIntegration } from "@/lib/instance-config";
import { getRequestOrigin } from "@/lib/url";

export default async function IntegrationsPage({
  searchParams,
}: {
  searchParams: Promise<{ quickbooks?: string; linear?: string }>;
}) {
  const { org, role } = await requireOrgContext();
  const readOnly = role === "MEMBER";
  // Credentials are instance-wide, so only owners can change them.
  const canEdit = role === "OWNER";
  const { quickbooks, linear } = await searchParams;

  const [connection, linearConnection, qbConfigured, linearConfigured, emailConfigured] =
    await Promise.all([
      prisma.quickBooksConnection.findUnique({ where: { orgId: org.id } }),
      prisma.linearConnection.findUnique({ where: { orgId: org.id } }),
      isQuickBooksConfigured(),
      isLinearConfigured(),
      isEmailConfigured(),
    ]);
  const [qbFields, linearFields, emailFields] = await Promise.all([
    describeIntegration("quickbooks"),
    describeIntegration("linear"),
    describeIntegration("email"),
  ]);
  // OAuth redirects come back to the address the admin is browsing on.
  const origin = await getRequestOrigin();

  return (
    <div className="grid items-start gap-6 lg:grid-cols-2">
      <QuickBooksCard
        connected={!!connection}
        realmId={connection?.realmId ?? null}
        readOnly={readOnly}
        callbackStatus={quickbooks}
        configured={qbConfigured}
        credentials={
          <IntegrationCredentials
            integration="quickbooks"
            fields={qbFields}
            configured={qbConfigured}
            canEdit={canEdit}
            callbackUrl={`${origin}/api/integrations/quickbooks/callback`}
            callbackLabel="redirect URI"
            appUrl="https://developer.intuit.com/app/developer/dashboard"
            appLabel="developer.intuit.com"
          />
        }
      />

      <LinearCard
        connected={!!linearConnection}
        workspaceName={linearConnection?.workspaceName ?? null}
        readOnly={readOnly}
        callbackStatus={linear}
        configured={linearConfigured}
        credentials={
          <IntegrationCredentials
            integration="linear"
            fields={linearFields}
            configured={linearConfigured}
            canEdit={canEdit}
            callbackUrl={`${origin}/api/integrations/linear/callback`}
            appUrl="https://linear.app/settings/api/applications/new"
            appLabel="Linear → Settings → API → OAuth applications"
          />
        }
      />

      <EmailCard
        configured={emailConfigured}
        credentials={
          <IntegrationCredentials
            integration="email"
            fields={emailFields}
            configured={emailConfigured}
            canEdit={canEdit}
            appUrl="https://resend.com/api-keys"
            appLabel="resend.com (API key, plus a verified sending domain)"
          />
        }
      />
    </div>
  );
}
