import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { requireOrgContext } from "@/lib/org-context";
import { Wordmark } from "@/components/brand-mark";
import { OrgBrand } from "@/components/org-brand";
import { BrandAccentStyle } from "@/components/brand-accent-style";
import { orgLogoUrl } from "@/lib/branding";
import { ThemeToggle } from "@/components/theme-toggle";
import { PhoneTabs } from "./phone-tabs";

export const metadata: Metadata = { title: "Phone" };

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fafafa" },
    { media: "(prefers-color-scheme: dark)", color: "#09090b" },
  ],
};

/** The phone view: the timer, logging time and evidence, and (for owners
 * and admins) what's owed, with tabs at the bottom. The full app is a tap
 * away. */
export default async function PhoneLayout({ children }: { children: React.ReactNode }) {
  const { org, role } = await requireOrgContext();
  const canManage = role === "OWNER" || role === "ADMIN";

  return (
    <div className="flex min-h-dvh w-full flex-col bg-background">
      {org.appAccentFromBrand ? <BrandAccentStyle color={org.brandColor} /> : null}
      <header className="sticky top-0 z-10 flex h-14 items-center gap-2 border-b border-border bg-background/95 px-4 backdrop-blur">
        <Link href="/m" className="min-w-0 text-base">
          {org.appBranding ? <OrgBrand name={org.name} logoUrl={orgLogoUrl(org)} /> : <Wordmark />}
        </Link>
        <div className="ml-auto flex items-center gap-1">
          <ThemeToggle />
        </div>
      </header>
      <main className="mx-auto w-full max-w-md flex-1 px-4 pt-4 pb-28">{children}</main>
      <PhoneTabs canManage={canManage} />
    </div>
  );
}
