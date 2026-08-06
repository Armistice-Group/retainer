import type { Metadata } from "next";
import { ShieldCheck } from "lucide-react";
import { auth } from "@/lib/auth";
import { SiteHeader, SiteFooter } from "@/components/marketing/site-chrome";
import { CookieNotice } from "@/components/cookie-notice";

const TITLE = "Security";
const DESCRIPTION = "How Consultainer protects your organization's data.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/security" },
  openGraph: { title: TITLE, description: DESCRIPTION, type: "website", url: "/security" },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION },
};

const CONTACT_EMAIL = "support@consultainer.app";

function Section({
  tag,
  title,
  children,
}: {
  tag: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="py-6">
      <p className="font-mono text-xs text-primary/70">{`// ${tag}`}</p>
      <h2 className="mt-1 font-medium text-foreground">{title}</h2>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">{children}</p>
    </div>
  );
}

export default async function SecurityPage() {
  const session = await auth();
  const isAuthenticated = !!session?.user;

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <SiteHeader isAuthenticated={isAuthenticated} showNav={false} />
      <main className="flex-1">
        <div className="mx-auto w-full max-w-3xl px-6 py-16">
          <div className="mb-2 flex items-center gap-2 text-primary">
            <ShieldCheck className="size-5" strokeWidth={1.75} />
            <span className="text-sm font-medium">Security</span>
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">
            How we protect your data
          </h1>
          <p className="mt-3 max-w-2xl text-muted-foreground">
            Consultainer holds sensitive client and billing data for engineering
            consultancies, so we treat security as part of the product, not an
            afterthought. Here&apos;s what that means concretely.
          </p>

          <div className="mt-8 flex flex-col divide-y divide-border border-t border-border">
            <Section tag="encryption" title="Encryption everywhere">
              All traffic to Consultainer is served over HTTPS. Your database is encrypted
              at rest, and OAuth tokens for connected integrations (QuickBooks, GitHub,
              Linear) are encrypted at rest separately from the data they access.
            </Section>

            <Section tag="auth" title="Account security options">
              Passwords are salted and hashed, never stored in plain text. You can
              additionally require a passkey, TOTP two-factor authentication, or your
              organization&apos;s own SSO provider (OIDC) for sign-in.
            </Section>

            <Section tag="tenant-isolation" title="Tenant isolation">
              Every record in Consultainer — clients, projects, time entries, invoices —
              is scoped to your organization at the database layer. Application code
              enforces that scope on every query; there&apos;s no cross-organization query
              path.
            </Section>

            <Section tag="infrastructure" title="Infrastructure">
              Consultainer runs on AWS, with a dedicated Postgres database (not shared
              infrastructure with any other Armistice Group product), automated encrypted
              backups, and secrets held in AWS Secrets Manager rather than in application
              config.
            </Section>

            <Section tag="backups" title="Backups & availability">
              Our production database takes automated daily backups with point-in-time
              recovery. We&apos;re a small, focused team running a single-region
              deployment today — if your organization requires multi-region failover
              guarantees as a condition of purchase, tell us and we&apos;ll talk through it
              directly.
            </Section>

            <Section tag="vendors" title="Vendors we rely on">
              AWS for hosting and infrastructure, Stripe for payment processing (we never
              see full card numbers), Resend for transactional email, and Rybbit for
              privacy-focused aggregate analytics. Integrations with QuickBooks, GitHub,
              and Linear are opt-in and only activate when you connect them. See our{" "}
              <a href="/privacy" className="text-primary hover:underline">
                Privacy Policy
              </a>{" "}
              for the full data-handling picture.
            </Section>

            <Section tag="certifications" title="Certifications">
              We don&apos;t currently hold formal certifications like SOC 2 or ISO 27001.
              If you&apos;re evaluating Consultainer as part of a vendor security review,
              email us — we&apos;re glad to walk through our architecture directly or fill
              out a questionnaire.
            </Section>

            <Section tag="disclosure" title="Reporting a vulnerability">
              Found a security issue? Email{" "}
              <a href={`mailto:${CONTACT_EMAIL}`} className="text-primary hover:underline">
                {CONTACT_EMAIL}
              </a>{" "}
              with details — we&apos;ll respond promptly and credit responsible disclosure.
            </Section>
          </div>
        </div>
      </main>
      <SiteFooter isAuthenticated={isAuthenticated} />
      <CookieNotice />
    </div>
  );
}
