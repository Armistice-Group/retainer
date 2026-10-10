import { requireOrgContext } from "@/lib/org-context";
import { prisma } from "@/lib/prisma";
import { QuickBooksCard } from "../quickbooks-card";
import { LinearCard } from "../linear-card";
import { FilesIntegrationsCard, type FileServiceSetup } from "../files-integrations-card";
import { FilingCard } from "../filing-card";
import { PROVIDERS, SLUG_FOR } from "@/lib/integrations/storage/registry";
import { EmailCard } from "../email-card";
import { IntegrationCredentials } from "../integration-credentials";
import { canWrite, isLinearConfigured } from "@/lib/integrations/linear";
import { isQuickBooksConfigured } from "@/lib/integrations/quickbooks";
import { isEmailConfigured } from "@/lib/email";
import { describeIntegration, getConfig } from "@/lib/instance-config";
import { getRequestOrigin } from "@/lib/url";

export default async function IntegrationsPage({
  searchParams,
}: {
  searchParams: Promise<{ quickbooks?: string; linear?: string }>;
}) {
  const { org, role, user } = await requireOrgContext();
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
  const fileServices: FileServiceSetup[] = await Promise.all(
    (
      [
        {
          integration: "googleDrive",
          id: "GOOGLE_DRIVE",
          appUrl: "https://console.cloud.google.com/apis/credentials",
          appLabel: "Google Cloud → APIs & Services → Credentials (OAuth client, Web application)",
          notes:
            "Enable the Google Drive API in the same project. drive.readonly is a restricted scope: make the OAuth consent screen Internal (Google Workspace) or keep it in testing with your people as test users to skip Google's verification.",
        },
        {
          integration: "dropbox",
          id: "DROPBOX",
          appUrl: "https://www.dropbox.com/developers/apps",
          appLabel: "Dropbox → App Console (Scoped access, Full Dropbox)",
          notes:
            "Permissions: account_info.read, files.metadata.read, files.content.read, files.content.write, sharing.read, sharing.write.",
        },
        {
          integration: "microsoft",
          id: "ONEDRIVE",
          appUrl: "https://entra.microsoft.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade",
          appLabel: "Microsoft Entra → App registrations (Web platform)",
          notes:
            "Delegated API permissions: User.Read, Files.ReadWrite.All, Sites.Read.All, offline_access. Set a tenant ID to allow only your organization's accounts.",
        },
        {
          integration: "notion",
          id: "NOTION",
          appUrl: "https://www.notion.so/profile/integrations",
          appLabel: "Notion → Integrations (Public integration)",
          notes:
            "Capabilities: read content, read user information including email addresses. People choose which pages Consultainer can see when they connect.",
        },
      ] as const
    ).map(async (s) => ({
      integration: s.integration,
      label: PROVIDERS[s.id].label,
      configured: await PROVIDERS[s.id].configured(),
      fields: await describeIntegration(s.integration),
      callbackUrl: `${origin}/api/integrations/files/${SLUG_FOR[s.id]}/callback`,
      appUrl: s.appUrl,
      appLabel: s.appLabel,
      notes: s.notes,
    }))
  );

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
        canWrite={linearConnection ? canWrite(linearConnection) : true}
        webhook={{
          url: `${origin}/api/webhooks/linear`,
          secretSet: !!(await getConfig("LINEAR_WEBHOOK_SECRET")),
          lastEventAt: linearConnection?.lastWebhookAt ?? null,
        }}
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

      <FilesIntegrationsCard services={fileServices} canEdit={canEdit} />

      <FilingCard
        readOnly={readOnly}
        myConnections={(
          await prisma.userConnection.findMany({
            where: { userId: user.id, provider: { in: ["GOOGLE_DRIVE", "DROPBOX", "ONEDRIVE"] } },
            select: { provider: true },
          })
        ).map((c) => c.provider)}
        filing={{
          provider: org.filingProvider,
          rootName: org.filingRootName,
          rootUrl: org.filingRootUrl,
          fileInvoices: org.fileInvoices,
          fileDocuments: org.fileDocuments,
          lastError: org.filingLastError,
          setUpBy: org.filingConnectionId
            ? ((
                await prisma.userConnection.findUnique({
                  where: { id: org.filingConnectionId },
                  select: { user: { select: { name: true } } },
                })
              )?.user.name ?? null)
            : null,
        }}
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
