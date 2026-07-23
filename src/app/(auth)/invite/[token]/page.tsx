import { prisma } from "@/lib/prisma";
import { InviteForm } from "./invite-form";
import { Alert, AlertDescription } from "@/components/ui/alert";

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const invite = await prisma.invite.findUnique({
    where: { token },
    include: { org: true },
  });

  if (!invite || invite.usedAt || invite.expiresAt < new Date() || !invite.email) {
    return (
      <Alert variant="destructive">
        <AlertDescription>
          This invite link is invalid or has expired. Ask your organization admin to send a new
          one.
        </AlertDescription>
      </Alert>
    );
  }

  const existingUser = await prisma.user.findUnique({ where: { email: invite.email } });

  return (
    <InviteForm
      token={token}
      orgName={invite.org.name}
      email={invite.email}
      isExistingUser={!!existingUser}
    />
  );
}
