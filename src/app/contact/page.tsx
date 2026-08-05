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

export default async function ContactPage() {
  const session = await auth();
  const isAuthenticated = !!session?.user;

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <SiteHeader isAuthenticated={isAuthenticated} />
      <main className="flex-1">
        <div className="mx-auto w-full max-w-lg px-6 py-16">
          <h1 className="text-3xl font-semibold tracking-tight">Get in touch</h1>
          <p className="mt-2 text-muted-foreground">
            Questions about Consultainer, a discount code, or evaluating it for your team? Send
            us a message.
          </p>
          <div className="mt-8">
            <ContactForm />
          </div>
        </div>
      </main>
      <SiteFooter isAuthenticated={isAuthenticated} />
      <CookieNotice />
    </div>
  );
}
