import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireOrgContext } from "@/lib/org-context";
import { prisma } from "@/lib/prisma";
import { ProfileNameForm, ChangePasswordForm } from "./profile-forms";
import { ApiKeysCard } from "./api-keys-card";

export default async function ProfilePage() {
  const { user, org } = await requireOrgContext();

  const apiKeys = await prisma.apiKey.findMany({
    where: { userId: user.id, orgId: org.id, revokedAt: null },
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, keyPrefix: true, createdAt: true, lastUsedAt: true },
  });

  return (
    <div className="flex max-w-2xl flex-col gap-6">
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
          <CardTitle className="text-base">Password</CardTitle>
        </CardHeader>
        <CardContent>
          <ChangePasswordForm />
        </CardContent>
      </Card>

      <ApiKeysCard apiKeys={apiKeys} />
    </div>
  );
}
