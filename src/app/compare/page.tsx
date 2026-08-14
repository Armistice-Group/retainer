import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Users, Building2, Clock } from "lucide-react";
import { auth } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SiteHeader, SiteFooter, ClosingCta } from "@/components/marketing/site-chrome";
import { CookieNotice } from "@/components/cookie-notice";

const TITLE = "Compare Consultainer to Bonsai, Productive.io, Harvest & Toggl";
const DESCRIPTION =
  "How Consultainer compares to Bonsai, Productive.io, Harvest, and Toggl Track for consulting teams that bill multiple people against the same client — features, pricing, and honest gaps.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/compare" },
  openGraph: { title: TITLE, description: DESCRIPTION, type: "website", url: "/compare" },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION },
};

const COMPETITORS = [
  {
    icon: Users,
    name: "Bonsai",
    href: "/vs/bonsai",
    blurb:
      "An all-in-one workspace built for solo freelancers — proposals, contracts, and payments, all sized around one person's invoice.",
    verdict: "Best if you're truly solo. Falls apart the moment you add a second billed person.",
  },
  {
    icon: Building2,
    name: "Productive.io",
    href: "/vs/productive",
    blurb:
      "A full agency-ops platform — resource planning, forecasting, a sales pipeline, profitability reporting.",
    verdict: "Best if you're running (or becoming) a 20+ person agency. Overkill under that.",
  },
  {
    icon: Clock,
    name: "Harvest & Toggl Track",
    href: "/#comparison",
    blurb:
      "Straightforward time trackers with light invoicing bolted on — no client or engagement context, no dev-tool sync.",
    verdict: "Best if all you need is a timer. Not built around the client relationship at all.",
  },
] as const;

export default async function ComparePage() {
  const session = await auth();
  const isAuthenticated = !!session?.user;

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <SiteHeader isAuthenticated={isAuthenticated} showNav={false} />
      <main className="flex-1">
        <section className="border-b border-border">
          <div className="mx-auto w-full max-w-3xl px-6 py-16 text-center">
            <p className="font-mono text-xs tracking-wide text-primary/70 uppercase">
              {"// Why Consultainer"}
            </p>
            <h1 className="mt-2 text-4xl font-semibold tracking-tight text-balance">
              How Consultainer compares
            </h1>
            <p className="mt-4 text-lg text-muted-foreground">
              Every tool below is a reasonable choice for somebody — just not for a small
              consulting team billing multiple people against the same client. Pick a
              comparison below for the honest, feature-by-feature version: what each tool does
              better, what it doesn&apos;t, and the real pricing math.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button size="lg" asChild>
                <Link href={isAuthenticated ? "/dashboard" : "/signup"}>
                  {isAuthenticated ? "Go to dashboard" : "Start free"}{" "}
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
              <Button size="lg" variant="outline" asChild>
                <Link href="/pricing">See pricing</Link>
              </Button>
            </div>
          </div>
        </section>

        <section>
          <div className="mx-auto grid w-full max-w-6xl gap-4 px-6 py-16 sm:grid-cols-3">
            {COMPETITORS.map((c) => (
              <Card key={c.name} className="gap-4 p-6">
                <c.icon className="size-5 text-primary" strokeWidth={1.75} />
                <div>
                  <h2 className="font-medium">Consultainer vs {c.name}</h2>
                  <p className="mt-2 text-sm text-muted-foreground">{c.blurb}</p>
                </div>
                <p className="text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">Verdict: </span>
                  {c.verdict}
                </p>
                <Link
                  href={c.href}
                  className="mt-auto flex items-center gap-1 text-sm text-primary hover:underline"
                >
                  See the comparison <ArrowRight className="size-3.5" />
                </Link>
              </Card>
            ))}
          </div>
        </section>

        <section className="border-t border-border bg-card/40">
          <div className="mx-auto w-full max-w-3xl px-6 py-16">
            <h2 className="text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
              Why we write comparisons this way
            </h2>
            <div className="mt-4 flex flex-col gap-4 text-muted-foreground">
              <p>
                Every comparison page on this site discloses what the other tool does better
                before it gets to what Consultainer does better. We&apos;d rather lose you to a
                tool that&apos;s actually a better fit than win you with a page that oversells.
                If a gap listed here gets closed, or a competitor changes their pricing, tell us
                — support@consultainer.app — and we&apos;ll update it.
              </p>
              <p>
                What Consultainer is actually built for: consulting and engineering teams —
                usually two to fifteen people — who bill multiple consultants at different rates
                against shared clients, track budgets against logged hours, run retainers with a
                real billed-vs-logged balance, and want their tools (Linear, QuickBooks, and any
                MCP-compatible AI agent) talking to the same system their invoices come
                from.
              </p>
            </div>
          </div>
        </section>
        <ClosingCta isAuthenticated={isAuthenticated} />
      </main>
      <SiteFooter isAuthenticated={isAuthenticated} />
      <CookieNotice />
    </div>
  );
}
