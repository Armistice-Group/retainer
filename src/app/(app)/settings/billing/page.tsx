import { requireOrgContext } from "@/lib/org-context";
import { prisma } from "@/lib/prisma";
import { getStripe, isStripeConfigured, isGrowthTierConfigured } from "@/lib/stripe";
import { decrypt } from "@/lib/crypto";
import { listEligibleAccounts } from "@/lib/integrations/mercury";
import { BillingCard } from "../billing-card";
import { StripeConnectCard } from "../stripe-connect-card";
import { MercuryConnectCard } from "../mercury-card";

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ checkout?: string; connect?: string }>;
}) {
  const { org, role } = await requireOrgContext();
  const readOnly = role === "MEMBER";
  const { checkout, connect } = await searchParams;

  const [clientCount, memberCount] = await Promise.all([
    prisma.client.count({ where: { orgId: org.id } }),
    prisma.membership.count({ where: { orgId: org.id } }),
  ]);

  // Express accounts don't push us a webhook we're set up to receive for
  // "onboarding finished" — instead, check on demand whenever the org comes
  // back from Stripe's onboarding flow (or just revisits this page), which
  // is the only moment this actually needs to be fresh.
  let chargesEnabled = org.stripeConnectChargesEnabled;
  if (org.plan === "GROWTH" && org.stripeConnectAccountId && !chargesEnabled && isStripeConfigured()) {
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
      console.warn("[billing] Failed to refresh Stripe Connect account status", err);
    }
  }

  const mercuryConnection =
    org.plan === "GROWTH"
      ? await prisma.mercuryConnection.findUnique({ where: { orgId: org.id } })
      : null;

  let mercuryAccounts: { id: string; name: string }[] = [];
  if (mercuryConnection) {
    try {
      mercuryAccounts = await listEligibleAccounts(decrypt(mercuryConnection.apiToken));
    } catch (err) {
      console.warn("[billing] Failed to refresh Mercury account list", err);
    }
  }

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <BillingCard
        plan={org.plan}
        subscriptionStatus={org.stripeSubscriptionStatus}
        clientCount={clientCount}
        memberCount={memberCount}
        readOnly={readOnly}
        stripeConfigured={isStripeConfigured()}
        growthTierConfigured={isGrowthTierConfigured()}
        checkoutStatus={checkout}
      />

      {org.plan === "GROWTH" ? (
        <StripeConnectCard
          accountId={org.stripeConnectAccountId}
          chargesEnabled={chargesEnabled}
          readOnly={readOnly}
          connectStatus={connect}
        />
      ) : null}

      {org.plan === "GROWTH" ? (
        <MercuryConnectCard
          connected={!!mercuryConnection}
          destinationAccountId={mercuryConnection?.destinationAccountId ?? null}
          accounts={mercuryAccounts}
          readOnly={readOnly}
        />
      ) : null}
    </div>
  );
}
