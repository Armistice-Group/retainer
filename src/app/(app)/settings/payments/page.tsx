import { requireOrgContext } from "@/lib/org-context";
import { prisma } from "@/lib/prisma";
import { getStripe, isStripeConfigured } from "@/lib/stripe";
import { decrypt } from "@/lib/crypto";
import { listEligibleAccounts } from "@/lib/integrations/mercury";
import { StripeConnectCard } from "../stripe-connect-card";
import { MercuryConnectCard } from "../mercury-card";
import { IntegrationCredentials } from "../integration-credentials";
import { PaymentMethodsEditor, type EditableMethod } from "@/components/payment-methods-editor";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { describeIntegration } from "@/lib/instance-config";
import { getRequestOrigin } from "@/lib/url";

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
  const stripeConfigured = await isStripeConfigured();
  if (org.stripeConnectAccountId && !chargesEnabled && stripeConfigured) {
    try {
      const account = await (await getStripe()).accounts.retrieve(org.stripeConnectAccountId);
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

  const [mercuryConnection, paymentMethods] = await Promise.all([
    prisma.mercuryConnection.findUnique({ where: { orgId: org.id } }),
    prisma.paymentMethod.findMany({
      where: { orgId: org.id, clientId: null },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: { id: true, type: true, label: true, details: true, showOnPdf: true },
    }),
  ]);

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
      <Card id="payment-methods">
        <CardHeader>
          <CardTitle className="text-base">Payment methods</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            How clients can pay you — listed on invoices and the client share page. A client can
            have its own methods instead, set on the client&apos;s page.
          </p>
          <PaymentMethodsEditor
            clientId={null}
            methods={paymentMethods as EditableMethod[]}
            readOnly={readOnly}
            emptyText="No payment methods yet."
          />
        </CardContent>
      </Card>
      {role === "OWNER" || !stripeConfigured ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Stripe</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">
              Optional. Adds a Pay now button to invoices through Stripe Connect. Needs a Stripe
              account with Connect enabled; send the webhook only the{" "}
              <code className="text-xs">checkout.session.completed</code> event.
            </p>
            <IntegrationCredentials
              integration="stripe"
              fields={await describeIntegration("stripe")}
              configured={stripeConfigured}
              canEdit={role === "OWNER"}
              callbackUrl={`${await getRequestOrigin()}/api/webhooks/stripe`}
              callbackLabel="webhook endpoint"
              appUrl="https://dashboard.stripe.com/apikeys"
              appLabel="dashboard.stripe.com"
            />
          </CardContent>
        </Card>
      ) : null}
      {stripeConfigured ? (
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
