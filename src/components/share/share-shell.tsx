import type { ReactNode } from "react";

/** Header + column shared by the share pages' gate, expired and
 * unavailable states: the org's logo (or name) and nothing about the
 * client. */
export function ShareShell({
  org,
  children,
}: {
  org: { name: string; logoUrl: string | null; logoData: Uint8Array | null; logoContentType: string | null };
  children: ReactNode;
}) {
  const logoSrc = org.logoData
    ? `data:${org.logoContentType};base64,${Buffer.from(org.logoData).toString("base64")}`
    : org.logoUrl;
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between px-6 py-5">
          {logoSrc ? (
            // eslint-disable-next-line @next/next/no-img-element -- external/data-URI logo, no static import
            <img src={logoSrc} alt={org.name} className="h-8 max-w-[160px] object-contain" />
          ) : (
            <span className="text-lg font-semibold tracking-tight">{org.name}</span>
          )}
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-md flex-col gap-4 px-6 py-16">{children}</main>
    </div>
  );
}

/** A full-page message with no client data: expired link, verification
 * unavailable. */
export function ShareNotice({
  org,
  title,
  children,
}: {
  org: { name: string; logoUrl: string | null; logoData: Uint8Array | null; logoContentType: string | null };
  title: string;
  children: ReactNode;
}) {
  return (
    <ShareShell org={org}>
      <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
      <p className="text-sm text-muted-foreground">{children}</p>
    </ShareShell>
  );
}
