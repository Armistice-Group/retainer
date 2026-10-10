import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireOrgContext } from "@/lib/org-context";
import { prisma } from "@/lib/prisma";
import { isEmailConfigured } from "@/lib/email";
import { PageHeader } from "@/components/layout/page-header";
import { ProfileNameForm, ChangePasswordForm, ChangeEmailForm } from "./profile-forms";
import { ApiKeysCard } from "./api-keys-card";
import { getOrigin } from "@/lib/url";
import { TwoFactorCard } from "./two-factor-card";
import { PasskeysCard } from "./passkeys-card";
import { ContractorProfileCard } from "./contractor-profile-card";
import { CalendarsCard } from "./calendars-card";
import { FileConnectionsCard } from "./file-connections-card";
import { PROVIDERS, SLUG_FOR } from "@/lib/integrations/storage/registry";
import { FILE_PROVIDERS } from "@/lib/integrations/storage/types";

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ files?: string }>;
}) {
  const { user, org } = await requireOrgContext();
  const { files: filesStatus } = await searchParams;
  const [dbUser, membership] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { twoFactorEnabled: true, email: true, passwordHash: true },
    }),
    prisma.membership.findUnique({
      where: { userId_orgId: { userId: user.id, orgId: org.id } },
      select: { id: true, employmentType: true, title: true, bio: true, resumeFileData: true },
    }),
  ]);

  const passkeys = await prisma.authenticator.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    select: { id: true, deviceName: true, createdAt: true, lastUsedAt: true },
  });

  const apiKeys = await prisma.apiKey.findMany({
    where: { userId: user.id, orgId: org.id, revokedAt: null },
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, keyPrefix: true, createdAt: true, lastUsedAt: true },
  });

  const fileConnections = await prisma.userConnection.findMany({
    where: { userId: user.id },
    select: { provider: true, accountEmail: true, accountName: true },
  });
  const fileServices = await Promise.all(
    FILE_PROVIDERS.map(async (id) => {
      const provider = PROVIDERS[id];
      const c = fileConnections.find((x) => x.provider === id);
      return {
        id,
        slug: SLUG_FOR[id],
        label: provider.label,
        configured: await provider.configured(),
        account: c ? (c.accountEmail ?? c.accountName ?? "Connected") : null,
      };
    })
  );

  const [calendarFeeds, rememberedCount] = await Promise.all([
    prisma.calendarFeed.findMany({
      where: { userId: user.id, orgId: org.id },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true, lastSyncedAt: true, lastError: true },
    }),
    prisma.calendarRule.count({ where: { userId: user.id } }),
  ]);

  return (
    <div>
      <PageHeader title="Profile" />
      <div className="grid items-start gap-6 lg:grid-cols-2">
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Your profile</CardTitle>
            </CardHeader>
            <CardContent>
              <ProfileNameForm name={user.name ?? ""} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Email</CardTitle>
            </CardHeader>
            <CardContent>
              <ChangeEmailForm
                currentEmail={dbUser.email}
                hasPassword={!!dbUser.passwordHash}
                emailEnabled={await isEmailConfigured()}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Password</CardTitle>
            </CardHeader>
            <CardContent>
              <ChangePasswordForm />
            </CardContent>
          </Card>

          {membership?.employmentType === "CONTRACTOR" ? (
            <ContractorProfileCard
              membershipId={membership.id}
              title={membership.title}
              bio={membership.bio}
              hasResume={!!membership.resumeFileData}
            />
          ) : null}
        </div>

        <div className="flex flex-col gap-6">
          <FileConnectionsCard services={fileServices} status={filesStatus} />

          <CalendarsCard
            feeds={calendarFeeds.map((f) => ({
              id: f.id,
              name: f.name,
              lastSyncedAt: f.lastSyncedAt?.toISOString() ?? null,
              lastError: f.lastError,
            }))}
            rememberedCount={rememberedCount}
          />

          <PasskeysCard
            passkeys={passkeys.map((p) => ({
              id: p.id,
              deviceName: p.deviceName,
              createdAt: p.createdAt.toISOString(),
              lastUsedAt: p.lastUsedAt?.toISOString() ?? null,
            }))}
          />

          <TwoFactorCard enabled={dbUser.twoFactorEnabled} />

          <ApiKeysCard apiKeys={apiKeys} mcpUrl={`${await getOrigin()}/api/mcp`} />
        </div>
      </div>
    </div>
  );
}
