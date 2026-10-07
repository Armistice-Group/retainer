import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireOrgContext } from "@/lib/org-context";
import { prisma } from "@/lib/prisma";
import { isEmailConfigured } from "@/lib/email";
import { PageHeader } from "@/components/layout/page-header";
import { ProfileNameForm, ChangePasswordForm, ChangeEmailForm } from "./profile-forms";
import { ApiKeysCard } from "./api-keys-card";
import { TwoFactorCard } from "./two-factor-card";
import { PasskeysCard } from "./passkeys-card";
import { ContractorProfileCard } from "./contractor-profile-card";

export default async function ProfilePage() {
  const { user, org } = await requireOrgContext();
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
                emailEnabled={isEmailConfigured()}
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
          <PasskeysCard
            passkeys={passkeys.map((p) => ({
              id: p.id,
              deviceName: p.deviceName,
              createdAt: p.createdAt.toISOString(),
              lastUsedAt: p.lastUsedAt?.toISOString() ?? null,
            }))}
          />

          <TwoFactorCard enabled={dbUser.twoFactorEnabled} />

          <ApiKeysCard apiKeys={apiKeys} />
        </div>
      </div>
    </div>
  );
}
