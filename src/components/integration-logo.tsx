import { cn } from "@/lib/utils";

/** Logos in public/integrations (sources in its README.md).
 * `invert`: a black mark, inverted in dark mode so it stays visible.
 * `dark`: the brand's own light-on-dark variant, in `<name>-dark.svg`. */
const LOGOS = {
  quickbooks: {},
  linear: {},
  stripe: {},
  mercury: { dark: true },
  docusign: {},
  documenso: { invert: true },
  ironclad: {},
  calcom: {},
  calendly: {},
  "google-drive": {},
  dropbox: {},
  onedrive: {},
  notion: { invert: true },
  resend: { invert: true },
} satisfies Record<string, { invert?: boolean; dark?: boolean }>;

export type IntegrationLogoName = keyof typeof LOGOS;

/** A service's mark, decorative (its name is always shown next to it). */
export function IntegrationLogo({ name, className }: { name: IntegrationLogoName; className?: string }) {
  const logo: { invert?: boolean; dark?: boolean } = LOGOS[name];
  const base = cn("size-5 shrink-0 object-contain", className);
  /* eslint-disable @next/next/no-img-element -- tiny static SVGs; nothing for next/image to optimize */
  if (logo.dark) {
    return (
      <>
        <img src={`/integrations/${name}.svg`} alt="" width={20} height={20} className={cn(base, "dark:hidden")} />
        <img
          src={`/integrations/${name}-dark.svg`}
          alt=""
          width={20}
          height={20}
          className={cn(base, "hidden dark:block")}
        />
      </>
    );
  }
  return (
    <img
      src={`/integrations/${name}.svg`}
      alt=""
      width={20}
      height={20}
      className={cn(base, logo.invert && "dark:invert")}
    />
  );
  /* eslint-enable @next/next/no-img-element */
}
