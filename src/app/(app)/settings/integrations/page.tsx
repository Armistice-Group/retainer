import { requireOrgContext } from "@/lib/org-context";
import { prisma } from "@/lib/prisma";
import { QuickBooksCard } from "../quickbooks-card";
import { LinearCard } from "../linear-card";
import { FilesIntegrationsCard, type FileServiceSetup } from "../files-integrations-card";
import { FilingCard } from "../filing-card";
import { StorageCard } from "../storage-card";
import { objectStorage } from "@/lib/object-storage";

async function storageStatus() {
  const store = await objectStorage();
  if (!store) return { mode: "database" as const, bucket: null, reachable: true, error: null };
  try {
    await store.check();
    return { mode: "object" as const, bucket: process.env.S3_BUCKET ?? null, reachable: true, error: null };
  } catch (err) {
    return {
      mode: "object" as const,
      bucket: process.env.S3_BUCKET ?? null,
      reachable: false,
      error: err instanceof Error ? err.name || err.message : null,
    };
  }
}
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
          appLabel: "the Google Cloud console",
          steps: [
            "Create a project (or pick one) in the project picker at the top.",
            "APIs & Services → Library: find Google Drive API and click Enable.",
            "Google Auth Platform (OAuth consent screen): click Get started and fill in the app name and emails. Audience: Internal if everyone signs in with your Google Workspace; otherwise External.",
            "External only: leave the app in Testing and add each person's Google address under Audience → Test users. Testing connections expire after 7 days; people then reconnect on their profile.",
            "Data Access → Add or remove scopes: add …/auth/drive.readonly and …/auth/drive.file, then Save.",
            "Clients → Create client: Application type Web application. Under Authorized redirect URIs, add the redirect URI below. Click Create.",
            "Copy the Client ID and Client secret into the fields below (copy the secret now; Google may not show it again).",
          ],
        },
        {
          integration: "dropbox",
          id: "DROPBOX",
          appUrl: "https://www.dropbox.com/developers/apps",
          appLabel: "the Dropbox App Console",
          steps: [
            "Click Create app. Choose Scoped access, then Full Dropbox, name the app and click Create app.",
            "Permissions tab: tick account_info.read, files.metadata.read, files.content.read, files.content.write, sharing.read and sharing.write, then click Submit. Do this before anyone connects; after any change, people must disconnect and reconnect.",
            "Settings tab → OAuth 2 → Redirect URIs: paste the redirect URI below and click Add.",
            "Copy the App key and App secret (click Show) from the Settings tab into the fields below.",
          ],
        },
        {
          integration: "microsoft",
          id: "ONEDRIVE",
          appUrl: "https://entra.microsoft.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade",
          appLabel: "Microsoft Entra → App registrations",
          steps: [
            "Click New registration and name the app.",
            "Supported account types: \"this organizational directory only\" to allow just your organization (then fill in the tenant ID below), or the multitenant option that includes personal Microsoft accounts.",
            "Redirect URI: choose Web and paste the redirect URI below. Click Register.",
            "Certificates & secrets → New client secret. Copy its Value (not the Secret ID). Note the expiry date: connections stop working when it expires, so add a new secret here before then.",
            "API permissions → Add a permission → Microsoft Graph → Delegated permissions: offline_access, User.Read, Files.ReadWrite.All, Sites.Read.All. Click Add permissions, then Grant admin consent if your organization requires it.",
            "From Overview, copy the Application (client) ID, and the Directory (tenant) ID if single-tenant, into the fields below.",
          ],
        },
        {
          integration: "notion",
          id: "NOTION",
          appUrl: "https://www.notion.so/profile/integrations",
          appLabel: "Notion → Integrations",
          steps: [
            "Click New integration and choose the Public type. Fill in the name, workspace and the company details Notion asks for.",
            "Under Redirect URIs, paste the redirect URI below.",
            "Capabilities: tick Read content, and Read user information including email addresses. Save.",
            "Copy the OAuth client ID and OAuth client secret into the fields below.",
            "When each person connects, Notion asks which pages to share. Only those pages show up in Consultainer.",
          ],
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
      steps: s.steps,
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

      <StorageCard {...(await storageStatus())} />

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
