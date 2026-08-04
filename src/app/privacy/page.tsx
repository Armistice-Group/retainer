import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { SiteHeader, SiteFooter } from "@/components/marketing/site-chrome";
import { CookieNotice } from "@/components/cookie-notice";

export const metadata: Metadata = {
  title: "Privacy Policy — Consultainer",
  description: "How Consultainer collects, uses, and protects your data.",
  alternates: { canonical: "/privacy" },
};

const EFFECTIVE_DATE = "August 4, 2026";
const CONTACT_EMAIL = "support@consultainer.app";

export default async function PrivacyPage() {
  const session = await auth();
  const isAuthenticated = !!session?.user;

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <SiteHeader isAuthenticated={isAuthenticated} showNav={false} />
      <main className="flex-1">
        <div className="mx-auto w-full max-w-3xl px-6 py-16">
          <h1 className="text-3xl font-semibold tracking-tight">Privacy Policy</h1>
          <p className="mt-2 text-sm text-muted-foreground">Effective {EFFECTIVE_DATE}</p>

          <div className="mt-10 flex flex-col gap-8 text-sm leading-relaxed text-muted-foreground">
            <p>
              This policy explains what Armistice Group LLC, doing business as
              Consultainer (&quot;we,&quot; &quot;us&quot;), collects when you use
              Consultainer, why, and the choices you have. It covers the Consultainer
              website and application together (the &quot;Service&quot;).
            </p>

            <section>
              <h2 className="text-base font-medium text-foreground">What we collect</h2>
              <p className="mt-2">
                <strong className="text-foreground">Account &amp; organization data:</strong>{" "}
                your name, email address, and password (stored as a salted hash, never in
                plain text) or, if you sign in with Google or your organization&apos;s SSO
                provider, an identifier from that provider. If you enable two-factor
                authentication or a passkey, we store the corresponding secret or
                credential needed to verify it.
              </p>
              <p className="mt-2">
                <strong className="text-foreground">Data you put into the Service:</strong>{" "}
                client and contact records, projects, tasks, time entries, milestones and
                their evidence (notes, links, and any file you attach), invoices, and any
                documents you upload to a client record (for example a W-9 or 1099 —
                which can contain a taxpayer ID, so treat that upload accordingly). This
                is your data; we process it on your behalf to run the Service.
              </p>
              <p className="mt-2">
                <strong className="text-foreground">Billing data:</strong> if you
                subscribe to a paid plan, our payment processor, Stripe, collects your
                payment details directly — we never see or store your full card number.
                We keep the resulting customer and subscription identifiers and status.
              </p>
              <p className="mt-2">
                <strong className="text-foreground">Integration data:</strong> if you
                connect QuickBooks, GitHub, or Linear, we store the OAuth tokens needed to
                act on your behalf (encrypted at rest) and the data you ask us to sync —
                for example, pushing an invoice to QuickBooks or pulling issues in from
                Linear as tasks.
              </p>
              <p className="mt-2">
                <strong className="text-foreground">Usage data:</strong> we use a
                privacy-focused analytics service (Rybbit) to understand aggregate page
                traffic — which pages get visited and roughly how — without building an
                advertising profile of you.
              </p>
            </section>

            <section>
              <h2 className="text-base font-medium text-foreground">Cookies</h2>
              <p className="mt-2">
                We use one strictly-necessary cookie to keep you signed in, which is
                required for the Service to work and isn&apos;t used for tracking or
                advertising. Our analytics provider may use a cookie or similar local
                storage to avoid double-counting a visit; it isn&apos;t used to identify
                you personally or track you across other sites.
              </p>
            </section>

            <section>
              <h2 className="text-base font-medium text-foreground">How we use it</h2>
              <p className="mt-2">
                To provide the Service you&apos;ve asked for: authenticate you, run the
                features you use, send transactional email you&apos;ve triggered (invites,
                magic links, invoice notifications, email-change confirmations), process
                billing, keep the Service secure and working, and — only with an
                administrator&apos;s configuration — sync a new signup as a company/contact
                record into our own CRM (Attio) for our own sales follow-up. We don&apos;t
                sell your data, and we don&apos;t use your Customer Data to train AI
                models.
              </p>
            </section>

            <section>
              <h2 className="text-base font-medium text-foreground">Who we share it with</h2>
              <p className="mt-2">
                Only the service providers that make Consultainer work: our hosting
                infrastructure (AWS), Stripe for payment processing, Resend for
                transactional email delivery, Rybbit for aggregate analytics, and — solely
                when you choose to connect them — QuickBooks, GitHub, and Linear. We
                don&apos;t share Customer Data with anyone else, and we disclose data to
                law enforcement only when legally required to.
              </p>
            </section>

            <section>
              <h2 className="text-base font-medium text-foreground">Data retention</h2>
              <p className="mt-2">
                We keep Customer Data for as long as your organization&apos;s account is
                active. If you delete a record (a client, a project, a document) inside
                the app, it&apos;s removed from our primary database; if you delete your
                whole organization, we delete or anonymize the associated data within a
                reasonable period, except where we&apos;re legally required to retain
                billing records for longer.
              </p>
            </section>

            <section>
              <h2 className="text-base font-medium text-foreground">Your choices</h2>
              <p className="mt-2">
                You can access, correct, export, or delete most of your data directly in
                the app. For anything you can&apos;t do yourself — including a full
                account deletion request — email{" "}
                <a href={`mailto:${CONTACT_EMAIL}`} className="text-primary hover:underline">
                  {CONTACT_EMAIL}
                </a>{" "}
                and we&apos;ll handle it.
              </p>
            </section>

            <section>
              <h2 className="text-base font-medium text-foreground">Security</h2>
              <p className="mt-2">
                We encrypt data in transit with HTTPS, hash passwords, encrypt stored
                integration credentials, and support passkeys, two-factor authentication,
                and SSO for your account. No method of storage or transmission is
                perfectly secure, but we take reasonable, industry-standard measures to
                protect your data.
              </p>
            </section>

            <section>
              <h2 className="text-base font-medium text-foreground">Changes to this policy</h2>
              <p className="mt-2">
                If we make a material change to this policy, we&apos;ll notify account
                owners by email or an in-app notice before it takes effect.
              </p>
            </section>

            <section>
              <h2 className="text-base font-medium text-foreground">Contact</h2>
              <p className="mt-2">
                Questions about this policy or your data? Email{" "}
                <a href={`mailto:${CONTACT_EMAIL}`} className="text-primary hover:underline">
                  {CONTACT_EMAIL}
                </a>
                .
              </p>
            </section>
          </div>
        </div>
      </main>
      <SiteFooter isAuthenticated={isAuthenticated} />
      <CookieNotice />
    </div>
  );
}
