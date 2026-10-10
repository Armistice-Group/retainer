import { redirect } from "next/navigation";
import { requireOrgContext, meetsTwoFactorRequirement } from "@/lib/org-context";
import { signOutAction } from "@/actions/session";
import { Wordmark } from "@/components/brand-mark";
import { Button } from "@/components/ui/button";
import { TwoFactorCard } from "@/app/(app)/profile/two-factor-card";

export const dynamic = "force-dynamic";

// Where requireOrgContext() sends someone whose organization requires
// two-factor authentication before they've set it up. Outside the (app)
// layout on purpose — that layout is what's gated.
export default async function TwoFactorSetupPage() {
  const { user, memberships } = await requireOrgContext({ allowMissingTwoFactor: true });
  const requiring = memberships.filter((m) => m.org.requireTwoFactor).map((m) => m.org.name);
  if (requiring.length === 0 || meetsTwoFactorRequirement(user)) redirect("/dashboard");

  const orgList =
    requiring.length === 1
      ? requiring[0]
      : `${requiring.slice(0, -1).join(", ")} and ${requiring[requiring.length - 1]}`;

  return (
    <div className="flex min-h-screen flex-1 flex-col items-center justify-center bg-background px-4 py-12">
      <div className="mb-8 text-xl">
        <Wordmark />
      </div>
      <div className="flex w-full max-w-md flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-lg font-semibold">Set up two-factor authentication</h1>
          <p className="text-sm text-muted-foreground">
            {`${orgList} requires two-factor authentication. Add an authenticator app to your account to continue — you'll be asked for a code from it each time you log in with your password.`}
          </p>
        </div>
        <TwoFactorCard enabled={false} doneHref="/dashboard" />
        <form action={signOutAction} className="flex items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">Signed in as {user.email}</p>
          <Button type="submit" variant="ghost" size="sm">
            Log out
          </Button>
        </form>
      </div>
    </div>
  );
}
