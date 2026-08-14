import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SiteHeader, SiteFooter, ClosingCta } from "@/components/marketing/site-chrome";
import { CookieNotice } from "@/components/cookie-notice";

export type VsRow = { label: string; consultainer: string; competitor: string };

export function VsPageShell({
  isAuthenticated,
  children,
}: {
  isAuthenticated: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <SiteHeader isAuthenticated={isAuthenticated} showNav={false} />
      <main className="flex-1">
        {children}
        <ClosingCta isAuthenticated={isAuthenticated} />
      </main>
      <SiteFooter isAuthenticated={isAuthenticated} />
      <CookieNotice />
    </div>
  );
}

export function VsHero({
  eyebrow,
  headline,
  intro,
  isAuthenticated,
}: {
  eyebrow: string;
  headline: React.ReactNode;
  intro: React.ReactNode;
  isAuthenticated: boolean;
}) {
  return (
    <section className="border-b border-border">
      <div className="mx-auto w-full max-w-3xl px-6 py-16 text-center">
        <p className="font-mono text-xs tracking-wide text-primary/70 uppercase">{eyebrow}</p>
        <h1 className="mt-2 text-4xl font-semibold tracking-tight text-balance">{headline}</h1>
        <p className="mt-4 text-lg text-muted-foreground">{intro}</p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Button size="lg" asChild>
            <Link href={isAuthenticated ? "/dashboard" : "/signup"}>
              {isAuthenticated ? "Go to dashboard" : "Start free"} <ArrowRight className="size-4" />
            </Link>
          </Button>
          <Button size="lg" variant="outline" asChild>
            <Link href="/pricing">See pricing</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}

export function VsDisclosure({ children }: { children: React.ReactNode }) {
  return (
    <section className="border-b border-border bg-card/40">
      <div className="mx-auto w-full max-w-3xl px-6 py-10">
        <p className="text-sm leading-relaxed text-muted-foreground">{children}</p>
      </div>
    </section>
  );
}

export function VsTable({
  competitorName,
  rows,
  note,
}: {
  competitorName: string;
  rows: readonly VsRow[];
  note?: React.ReactNode;
}) {
  return (
    <section>
      <div className="mx-auto w-full max-w-6xl px-6 py-16">
        <div className="mb-10 max-w-xl">
          <h2 className="text-3xl font-semibold tracking-tight text-balance">
            Feature by feature
          </h2>
          {note ? <p className="mt-3 text-muted-foreground">{note}</p> : null}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="py-3 pr-4 text-left font-normal text-muted-foreground" />
                <th className="border-x border-border bg-primary/5 px-4 py-3 text-left font-mono font-medium text-primary">
                  Consultainer
                </th>
                <th className="px-4 py-3 text-left font-mono font-normal text-muted-foreground">
                  {competitorName}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.label} className="border-b border-border">
                  <td className="py-3 pr-4 text-muted-foreground">{row.label}</td>
                  <td className="border-x border-border bg-primary/5 px-4 py-3 font-medium text-foreground">
                    {row.consultainer}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{row.competitor}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

export function VsSection({
  heading,
  muted = false,
  children,
}: {
  heading: string;
  muted?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className={muted ? "border-t border-border bg-card/40" : "border-t border-border"}>
      <div className="mx-auto w-full max-w-3xl px-6 py-16">
        <h2 className="text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
          {heading}
        </h2>
        <div className="mt-4 flex flex-col gap-4 text-muted-foreground">{children}</div>
      </div>
    </section>
  );
}

export function VsCrossLink() {
  return (
    <div className="mx-auto w-full max-w-3xl px-6 pb-16">
      <p className="text-sm text-muted-foreground">
        See how Consultainer compares to other tools on the{" "}
        <Link href="/compare" className="text-primary hover:underline">
          full comparison page
        </Link>
        .
      </p>
    </div>
  );
}
