import { requireOrgContext } from "@/lib/org-context";
import { prisma } from "@/lib/prisma";
import { getStripe, isStripeConfigured } from "@/lib/stripe";
import { decrypt } from "@/lib/crypto";
import { listEligibleAccounts } from "@/lib/integrations/mercury";
import { StripeConnectCard } from "../stripe-connect-card";
import { MercuryConnectCard } from "../mercury-card";

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ connect?: string }>;
}) {
  const { org, role } = await requireOrgContext();
  const readOnly = role === "MEMBER";
  const { connect } = await searchParams;

  // Express accounts don't push us a webhook we're set up to receive for
  // "onboarding finished" — instead, check on demand whenever the org comes
  // back from Stripe's onboarding flow (or just revisits this page), which
  // is the only moment this actually needs to be fresh.
  let chargesEnabled = org.stripeConnectChargesEnabled;
  if (org.stripeConnectAccountId && !chargesEnabled && isStripeConfigured()) {
    try {
      const account = await getStripe().accounts.retrieve(org.stripeConnectAccountId);
      chargesEnabled = !!account.charges_enabled;
      if (chargesEnabled) {
        await prisma.organization.update({
          where: { id: org.id },
          data: { stripeConnectChargesEnabled: true },
        });
      }
    } catch (err) {
      console.warn("[payments] Failed to refresh Stripe Connect account status", err);
    }
  }

  const mercuryConnection = await prisma.mercuryConnection.findUnique({ where: { orgId: org.id } });

  let mercuryAccounts: { id: string; name: string }[] = [];
  if (mercuryConnection) {
    try {
      mercuryAccounts = await listEligibleAccounts(decrypt(mercuryConnection.apiToken));
    } catch (err) {
      console.warn("[payments] Failed to refresh Mercury account list", err);
    }
  }

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      {isStripeConfigured() ? (
        <StripeConnectCard
          accountId={org.stripeConnectAccountId}
          chargesEnabled={chargesEnabled}
          readOnly={readOnly}
          connectStatus={connect}
        />
      ) : null}

      <MercuryConnectCard
        connected={!!mercuryConnection}
        destinationAccountId={mercuryConnection?.destinationAccountId ?? null}
        accounts={mercuryAccounts}
        readOnly={readOnly}
      />
    </div>
  );
}
