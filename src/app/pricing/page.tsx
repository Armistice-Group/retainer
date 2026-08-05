import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { SiteHeader, SiteFooter } from "@/components/marketing/site-chrome";
import { CookieNotice } from "@/components/cookie-notice";
import { PricingSection } from "@/components/marketing/pricing-section";
import { FaqSection } from "@/components/marketing/faq-section";

export const metadata: Metadata = {
  title: "Pricing — Consultainer",
  description: "One flat price per organization, unlimited team members. Start free.",
  alternates: { canonical: "/pricing" },
};

export default async function PricingPage() {
  const session = await auth();
  const isAuthenticated = !!session?.user;

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <SiteHeader isAuthenticated={isAuthenticated} />
      <main className="flex-1">
        <PricingSection isAuthenticated={isAuthenticated} />
        <FaqSection />
      </main>
      <SiteFooter isAuthenticated={isAuthenticated} />
      <CookieNotice />
    </div>
  );
}
