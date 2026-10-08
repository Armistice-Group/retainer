import Link from "next/link";
import { Wordmark } from "@/components/brand-mark";
import { OrgBrand } from "@/components/org-brand";
import { BrandAccentStyle } from "@/components/brand-accent-style";
import { getInstanceBranding, orgLogoUrl } from "@/lib/branding";

export const dynamic = "force-dynamic";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const branding = await getInstanceBranding();

  return (
    <div className="flex min-h-screen flex-1 flex-col items-center justify-center bg-background px-4 py-12">
      {branding?.appAccentFromBrand ? <BrandAccentStyle color={branding.brandColor} /> : null}
      <div className="mb-8 flex flex-col items-center gap-1">
        <Link href="/" className="text-xl">
          {branding ? (
            <OrgBrand
              name={branding.name}
              logoUrl={orgLogoUrl(branding)}
              className="[&_img]:h-8 [&_img]:max-w-40"
            />
          ) : (
            <Wordmark />
          )}
        </Link>
        {branding ? null : (
          <p className="text-sm text-muted-foreground">
            Clients, projects, time, and invoices — in one place.
          </p>
        )}
      </div>
      <div className="w-full max-w-sm">{children}</div>
      {branding ? (
        <p className="mt-8 text-xs text-muted-foreground">Powered by Consultainer</p>
      ) : null}
    </div>
  );
}
