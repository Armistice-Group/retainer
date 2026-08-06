import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { SiteHeader, SiteFooter } from "@/components/marketing/site-chrome";
import { CookieNotice } from "@/components/cookie-notice";
import { ContactForm } from "./contact-form";

const TITLE = "Contact";
const DESCRIPTION = "Get in touch with the Consultainer team.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/contact" },
  openGraph: { title: TITLE, description: DESCRIPTION, type: "website", url: "/contact" },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION },
};

const REASONS = [
  {
    tag: "general",
    title: "General questions",
    body: "How Consultainer works, whether it fits your setup, anything you're unsure about before signing up.",
  },
  {
    tag: "discount-codes",
    title: "Discount codes",
    body: "New-customer offers, campaign codes, student/military discounts — ask if you're eligible for one.",
  },
  {
    tag: "team-evaluation",
    title: "Evaluating for a team",
    body: "Rolling this out for a consultancy with existing clients and projects? We're happy to walk through migration and setup directly.",
  },
] as const;

const CONTACT_EMAIL = "support@consultainer.app";

export default async function ContactPage() {
  const session = await auth();
  const isAuthenticated = !!session?.user;

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <SiteHeader isAuthenticated={isAuthenticated} />
      <main className="flex-1">
        <div className="mx-auto grid w-full max-w-5xl gap-12 px-6 py-16 lg:grid-cols-[1fr_1.1fr] lg:items-start">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Get in touch</h1>
            <p className="mt-2 max-w-sm text-muted-foreground">
              Questions about Consultainer, a discount code, or evaluating it for your team?
              Send us a message.
            </p>

            <div className="mt-10 flex flex-col divide-y divide-border border-t border-border">
              {REASONS.map((r) => (
                <div key={r.tag} className="py-5">
                  <p className="font-mono text-xs text-primary/70">{`// ${r.tag}`}</p>
                  <h2 className="mt-1 font-medium">{r.title}</h2>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{r.body}</p>
                </div>
              ))}
            </div>

            <p className="mt-6 text-sm text-muted-foreground">
              Prefer email?{" "}
              <a href={`mailto:${CONTACT_EMAIL}`} className="text-primary hover:underline">
                {CONTACT_EMAIL}
              </a>
            </p>
          </div>

          <ContactForm />
        </div>
      </main>
      <SiteFooter isAuthenticated={isAuthenticated} />
      <CookieNotice />
    </div>
  );
}
