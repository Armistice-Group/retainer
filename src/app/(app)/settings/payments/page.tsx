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
import { isEmailConfigured } from "@/lib/email";
import { RemindersCard } from "./reminders-card";
import { DocsLink } from "@/components/docs-link";
import { IntegrationCardHeader } from "@/components/integration-card-header";

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
          <IntegrationCardHeader
            title="Stripe"
            logos={["stripe"]}
            status={{ connected: stripeConfigured, connectedLabel: "Set up", notConnectedLabel: "Not set up" }}
          />
          <CardContent className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">
              Optional. Adds a Pay now button to invoices through Stripe Connect: clients pay by
              card or ACH, and the invoice is marked paid when Stripe confirms.
            </p>
            {role === "OWNER" ? (
              <details className="text-sm">
                <summary className="cursor-pointer font-medium">How to set this up</summary>
                <ol className="mt-2 list-decimal space-y-1 pl-4 text-xs text-muted-foreground">
                  <li>
                    In the Stripe Dashboard, open <strong>Connect</strong> and finish the platform
                    setup Stripe asks for.
                  </li>
                  <li>
                    Under <strong>Developers → API keys</strong>, copy the{" "}
                    <strong>Secret key</strong> into the field below.
                  </li>
                  <li>
                    Under <strong>Developers → Webhooks</strong>, add an endpoint for events on{" "}
                    <strong>Your account</strong> with the URL below, and select these
                    three events: <code>checkout.session.completed</code>,{" "}
                    <code>checkout.session.async_payment_succeeded</code> and{" "}
                    <code>checkout.session.async_payment_failed</code> (the last two are how bank
                    payments get marked paid, or unpaid again, once they clear).
                  </li>
                  <li>
                    Copy that endpoint&apos;s <strong>Signing secret</strong> (whsec_…) into the
                    field below and click <strong>Save credentials</strong>. Use keys and webhook
                    from the same mode (test or live).
                  </li>
                  <li>
                    Then click <strong>Connect Stripe</strong>{" "}to onboard this organization&apos;s
                    account.
                  </li>
                </ol>
                <DocsLink page="integrations/payments#collect-card-and-ach-payments-with-stripe" />
              </details>
            ) : null}
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

      <RemindersCard
        days={org.overdueReminderDays}
        readOnly={readOnly}
        emailConfigured={await isEmailConfigured()}
      />

      <MercuryConnectCard
        connected={!!mercuryConnection}
        destinationAccountId={mercuryConnection?.destinationAccountId ?? null}
        accounts={mercuryAccounts}
        readOnly={readOnly}
      />
    </div>
  );
}
