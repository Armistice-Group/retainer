import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { SiteHeader, SiteFooter, ClosingCta } from "@/components/marketing/site-chrome";
import { CookieNotice } from "@/components/cookie-notice";

const TITLE = "Terms of Service";
const DESCRIPTION = "The terms that govern use of Consultainer.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/terms" },
  openGraph: { title: TITLE, description: DESCRIPTION, type: "website", url: "/terms" },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION },
};

const EFFECTIVE_DATE = "August 4, 2026";
const CONTACT_EMAIL = "support@consultainer.app";

export default async function TermsPage() {
  const session = await auth();
  const isAuthenticated = !!session?.user;

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <SiteHeader isAuthenticated={isAuthenticated} showNav={false} />
      <main className="flex-1">
        <div className="mx-auto w-full max-w-3xl px-6 py-16">
          <h1 className="text-3xl font-semibold tracking-tight">Terms of Service</h1>
          <p className="mt-2 text-sm text-muted-foreground">Effective {EFFECTIVE_DATE}</p>

          <div className="mt-10 flex flex-col gap-8 text-sm leading-relaxed text-muted-foreground">
            <p>
              Consultainer (&quot;Consultainer,&quot; &quot;we,&quot; &quot;us&quot;) is
              operated by Armistice Group LLC. These Terms of Service (&quot;Terms&quot;)
              govern your access to and use of Consultainer, including the website, the
              application, our REST API, and our MCP server (together, the
              &quot;Service&quot;). By creating an account or otherwise using the Service,
              you agree to these Terms on behalf of yourself and, if applicable, the
              organization you represent.
            </p>

            <section>
              <h2 className="text-base font-medium text-foreground">1. The Service</h2>
              <p className="mt-2">
                Consultainer helps consultants and consulting firms manage clients,
                projects, time tracking, milestones, and invoicing, and offers optional
                integrations with third-party services (currently QuickBooks Online
                and Linear) and optional connectivity to AI assistants via the
                Model Context Protocol (MCP). We may add, change, or remove features at
                any time.
              </p>
            </section>

            <section>
              <h2 className="text-base font-medium text-foreground">2. Accounts &amp; organizations</h2>
              <p className="mt-2">
                You must provide accurate information when creating an account and are
                responsible for activity that occurs under it, including activity by
                teammates you invite into your organization. You&apos;re responsible for
                keeping your credentials — password, passkeys, API keys, and two-factor
                recovery codes — confidential. Tell us promptly at{" "}
                <a href={`mailto:${CONTACT_EMAIL}`} className="text-primary hover:underline">
                  {CONTACT_EMAIL}
                </a>{" "}
                if you suspect unauthorized use of your account.
              </p>
            </section>

            <section>
              <h2 className="text-base font-medium text-foreground">3. Your content</h2>
              <p className="mt-2">
                You retain ownership of the data you put into Consultainer — client
                records, time entries, invoices, uploaded documents, and anything else you
                or your team create (&quot;Customer Data&quot;). You grant us the limited
                right to host, process, and display Customer Data solely to provide and
                support the Service, including sending emails you request (like invite and
                invoice notifications) and, for integrations you connect, exchanging data
                with that third party on your behalf. You&apos;re responsible for having
                the right to store and process the Customer Data you upload, including any
                client contact details or tax documents (like W-9s or 1099s).
              </p>
            </section>

            <section>
              <h2 className="text-base font-medium text-foreground">4. Billing</h2>
              <p className="mt-2">
                The free plan is limited as described on our pricing page and may change.
                Paid subscriptions are billed in advance on a monthly or annual basis
                through Stripe, our payment processor; we don&apos;t store your card
                details ourselves. Subscriptions renew automatically until canceled.
                Fees are non-refundable except where required by law. You can cancel or
                downgrade at any time from Settings — access continues through the end of
                the current billing period.
              </p>
            </section>

            <section>
              <h2 className="text-base font-medium text-foreground">5. Acceptable use</h2>
              <p className="mt-2">
                Don&apos;t use the Service to violate the law, infringe anyone&apos;s
                rights, store or transmit malware, attempt to gain unauthorized access to
                other accounts or our infrastructure, or interfere with the Service&apos;s
                normal operation, including our REST API or MCP server.
              </p>
            </section>

            <section>
              <h2 className="text-base font-medium text-foreground">6. Third-party integrations</h2>
              <p className="mt-2">
                Connecting QuickBooks, Linear, or any other integration is
                optional and governed by that provider&apos;s own terms. We&apos;re not
                responsible for those providers&apos; services, and disconnecting an
                integration in Consultainer doesn&apos;t automatically revoke access on
                the provider&apos;s side — do that from the provider&apos;s own settings
                as well.
              </p>
            </section>

            <section>
              <h2 className="text-base font-medium text-foreground">7. Termination</h2>
              <p className="mt-2">
                You can delete your organization or stop using the Service at any time.
                We may suspend or terminate access for material breach of these Terms,
                including non-payment, after reasonable notice where practical. On
                termination, we&apos;ll delete or anonymize Customer Data within a
                reasonable period, except where we&apos;re required to retain it (for
                example, billing records).
              </p>
            </section>

            <section>
              <h2 className="text-base font-medium text-foreground">8. Disclaimers &amp; liability</h2>
              <p className="mt-2">
                The Service is provided &quot;as is,&quot; without warranties of any
                kind, express or implied. To the maximum extent permitted by law,
                Armistice Group LLC won&apos;t be liable for indirect, incidental, or
                consequential damages, and our total liability for any claim relating to
                the Service is limited to the amount you paid us in the twelve months
                before the claim arose.
              </p>
            </section>

            <section>
              <h2 className="text-base font-medium text-foreground">9. Changes to these Terms</h2>
              <p className="mt-2">
                We may update these Terms from time to time. If a change is material,
                we&apos;ll notify account owners by email or an in-app notice before it
                takes effect. Continued use of the Service after a change takes effect
                means you accept the updated Terms.
              </p>
            </section>

            <section>
              <h2 className="text-base font-medium text-foreground">10. Contact</h2>
              <p className="mt-2">
                Questions about these Terms? Reach us at{" "}
                <a href={`mailto:${CONTACT_EMAIL}`} className="text-primary hover:underline">
                  {CONTACT_EMAIL}
                </a>
                .
              </p>
            </section>
          </div>
        </div>
        <ClosingCta isAuthenticated={isAuthenticated} />
      </main>
      <SiteFooter isAuthenticated={isAuthenticated} />
      <CookieNotice />
    </div>
  );
}
