import Link from "next/link";
import {
  Building2,
  GitBranch,
  ShieldCheck,
  Clock,
  FileText,
  Bot,
  Check,
  ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MONTHLY_PRICE_USD, YEARLY_PRICE_USD, YEARLY_DISCOUNT_PERCENT } from "@/lib/pricing";
import { SiteHeader, SiteFooter } from "@/components/marketing/site-chrome";
import { CookieNotice } from "@/components/cookie-notice";

const FEATURES = [
  {
    icon: Building2,
    title: "Clients & engagements",
    body: "Every engagement's contacts, staging URLs, and Drive folders live on its page — not scattered across a doc you have to hunt for.",
  },
  {
    icon: GitBranch,
    title: "Projects, tasks & Linear",
    body: "Projects carry their own team and bill rate, and pull real issues in from Linear — assign actual backlog items, not a bucket for hours.",
  },
  {
    icon: ShieldCheck,
    title: "AI Code Health",
    body: "Scan a client's repo for the security issues AI-generated code tends to leave behind, and gate invoices on a clean pass before they go out.",
  },
  {
    icon: Clock,
    title: "Time tracking",
    body: "A weekly view for your own hours, a team view for owners — with rate overrides and reassignment when the standard rate doesn't apply.",
  },
  {
    icon: FileText,
    title: "Milestones, invoicing & QuickBooks",
    body: "Bill hourly from unbilled time or fixed-price by milestone with evidence attached, then download a PDF or push straight to QuickBooks.",
  },
  {
    icon: Bot,
    title: "API & MCP for Claude Code",
    body: "A REST API and a real MCP server — log hours, check what's unbilled, or generate an invoice straight from Claude Code without opening a browser tab.",
  },
] as const;

export function LandingPage({ isAuthenticated }: { isAuthenticated: boolean }) {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <SiteHeader isAuthenticated={isAuthenticated} />
      <main className="flex-1">
        <Hero isAuthenticated={isAuthenticated} />
        <ReplacesRow />
        <Features />
        <McpSpotlight />
        <Pricing isAuthenticated={isAuthenticated} />
        <FinalCta isAuthenticated={isAuthenticated} />
      </main>
      <SiteFooter isAuthenticated={isAuthenticated} />
      <CookieNotice />
    </div>
  );
}

function Hero({ isAuthenticated }: { isAuthenticated: boolean }) {
  return (
    <section className="mx-auto grid w-full max-w-6xl gap-12 px-6 py-20 lg:grid-cols-2 lg:items-center lg:py-28">
      <div>
        <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
          Everything a software consultancy needs. Nothing it doesn&apos;t.
        </h1>
        <p className="mt-5 max-w-lg text-lg leading-relaxed text-muted-foreground">
          Clients, projects, time, and invoices in one place — built for software
          consultants and dev shops tired of stitching together a timer, an invoicing
          tool, a repo scanner, and a doc full of client logins.
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-3">
          {isAuthenticated ? (
            <Button size="lg" asChild>
              <Link href="/dashboard">
                Go to dashboard <ArrowRight className="size-4" />
              </Link>
            </Button>
          ) : (
            <>
              <Button size="lg" asChild>
                <Link href="/signup">
                  Start free <ArrowRight className="size-4" />
                </Link>
              </Button>
              <Button size="lg" variant="outline" asChild>
                <Link href="/login">Log in</Link>
              </Button>
            </>
          )}
        </div>
        {!isAuthenticated ? (
          <p className="mt-4 text-sm text-muted-foreground">
            Free for up to 2 clients. No credit card.
          </p>
        ) : null}
      </div>

      <LedgerPreview />
    </section>
  );
}

function LedgerPreview() {
  const rows = [
    { label: "API integration — payments service", hours: "4.00", rate: "175.00", amount: "700.00" },
    { label: "Code review — checkout flow", hours: "3.00", rate: "175.00", amount: "525.00" },
    { label: "Staging deploy & QA", hours: "5.00", rate: "175.00", amount: "875.00" },
  ];

  return (
    <Card className="gap-0 overflow-hidden p-0 shadow-sm">
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <div>
          <p className="text-sm font-medium">INV-0004</p>
          <p className="text-xs text-muted-foreground">Fintra Labs</p>
        </div>
        <Badge variant="outline" className="font-normal">
          Draft
        </Badge>
      </div>
      <div className="flex flex-col divide-y divide-border px-5">
        {rows.map((row) => (
          <div
            key={row.label}
            className="flex flex-col gap-0.5 py-3 text-sm sm:flex-row sm:items-center sm:justify-between sm:gap-2"
          >
            <span className="text-muted-foreground">{row.label}</span>
            <span className="flex items-center justify-between gap-2 sm:contents">
              <span className="tabular-figures text-muted-foreground sm:text-foreground">
                {row.hours}h × ${row.rate}
              </span>
              <span className="tabular-figures w-20 text-right font-medium">
                ${row.amount}
              </span>
            </span>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between border-t border-border bg-muted/40 px-5 py-4">
        <span className="text-sm font-semibold">Total</span>
        <span className="tabular-figures text-lg font-semibold">$2,100.00</span>
      </div>
    </Card>
  );
}

function ReplacesRow() {
  const items = [
    "A timer app",
    "A separate invoicing tool",
    "A doc of client logins",
    "A repo security scanner",
  ];
  return (
    <section className="border-y border-border bg-card/40">
      <div className="mx-auto flex w-full max-w-6xl flex-col items-center gap-4 px-6 py-8 text-center sm:flex-row sm:justify-center sm:gap-6 sm:text-left">
        <p className="text-sm font-medium text-muted-foreground">Replaces:</p>
        <div className="flex flex-wrap items-center justify-center gap-2">
          {items.map((item, i) => (
            <span key={item} className="flex items-center gap-2">
              <Badge variant="outline" className="font-normal">
                {item}
              </Badge>
              {i < items.length - 1 ? (
                <span className="text-muted-foreground">+</span>
              ) : null}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

function Features() {
  return (
    <section id="features" className="mx-auto w-full max-w-6xl px-6 py-20">
      <div className="mb-12 max-w-xl">
        <h2 className="text-3xl font-semibold tracking-tight">
          Built for how software consulting actually runs
        </h2>
        <p className="mt-3 text-muted-foreground">
          Not a generic timer with an invoice bolted on — the parts of the job that
          actually take time to organize.
        </p>
      </div>
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((feature) => (
          <Card key={feature.title} className="gap-3 p-6">
            <feature.icon className="size-5 text-primary" strokeWidth={1.75} />
            <h3 className="font-medium">{feature.title}</h3>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {feature.body}
            </p>
          </Card>
        ))}
      </div>
    </section>
  );
}

function McpSpotlight() {
  return (
    <section className="border-y border-border bg-card/40">
      <div className="mx-auto grid w-full max-w-6xl gap-10 px-6 py-20 lg:grid-cols-2 lg:items-center">
        <div>
          <Badge variant="outline" className="mb-4 font-normal">
            <Bot className="size-3.5" /> MCP server included
          </Badge>
          <h2 className="text-3xl font-semibold tracking-tight text-balance">
            Talk to your time tracker.
          </h2>
          <p className="mt-4 text-muted-foreground">
            Consultainer ships with a real MCP server. Connect it to Claude Desktop or
            Claude Code and log hours, check what&apos;s unbilled, or generate an
            invoice — without opening a browser tab.
          </p>
        </div>
        <Card className="gap-3 p-5 font-mono text-sm">
          <p className="text-muted-foreground">
            &gt; Log 3.5 hours to Fintra Labs for the API migration
          </p>
          <p className="flex items-center gap-2 text-foreground">
            <Check className="size-4 shrink-0 text-chart-3" />
            Logged 3.50h to Fintra Labs — API migration
          </p>
          <p className="mt-2 text-muted-foreground">&gt; What&apos;s still unbilled this month?</p>
          <p className="text-foreground">14.25h across 2 clients, ~$2,493.75</p>
        </Card>
      </div>
    </section>
  );
}

function Pricing({ isAuthenticated }: { isAuthenticated: boolean }) {
  return (
    <section id="pricing" className="mx-auto w-full max-w-6xl px-6 py-20">
      <div className="mb-12 max-w-xl">
        <h2 className="text-3xl font-semibold tracking-tight">
          One plan. One price. No seat math.
        </h2>
        <p className="mt-3 text-muted-foreground">
          Start free, upgrade when you outgrow it — not before.
        </p>
      </div>
      <div className="grid gap-6 sm:grid-cols-2 lg:mx-auto lg:max-w-3xl">
        <Card className="gap-6 p-8">
          <div>
            <h3 className="font-medium">Free</h3>
            <p className="mt-2 text-3xl font-semibold tabular-figures">$0</p>
            <p className="text-sm text-muted-foreground">forever</p>
          </div>
          <ul className="flex flex-col gap-2.5 text-sm">
            {["Up to 2 clients", "1 user", "Time tracking & invoicing", "PDF invoices"].map(
              (item) => (
                <li key={item} className="flex items-center gap-2">
                  <Check className="size-4 shrink-0 text-muted-foreground" />
                  {item}
                </li>
              )
            )}
          </ul>
          <Button variant="outline" asChild>
            <Link href={isAuthenticated ? "/dashboard" : "/signup"}>
              {isAuthenticated ? "Go to dashboard" : "Start free"}
            </Link>
          </Button>
        </Card>

        <Card className="gap-6 border-primary/40 p-8">
          <div>
            <h3 className="font-medium">Consultainer</h3>
            <p className="mt-2 text-3xl font-semibold tabular-figures">
              ${MONTHLY_PRICE_USD.toFixed(2)}
              <span className="text-base font-normal text-muted-foreground">/mo</span>
            </p>
            <p className="text-sm text-muted-foreground">
              flat, per organization — or ${YEARLY_PRICE_USD.toFixed(2)}/yr, save{" "}
              {YEARLY_DISCOUNT_PERCENT}%
            </p>
          </div>
          <ul className="flex flex-col gap-2.5 text-sm">
            {[
              "Unlimited clients & projects",
              "Unlimited team members",
              "Rate overrides & team time view",
              "Milestones & QuickBooks push",
              "GitHub Code Health & Linear sync",
              "REST API & MCP access",
            ].map((item) => (
              <li key={item} className="flex items-center gap-2">
                <Check className="size-4 shrink-0 text-primary" />
                {item}
              </li>
            ))}
          </ul>
          <Button asChild>
            <Link href={isAuthenticated ? "/dashboard" : "/signup"}>
              {isAuthenticated ? "Go to dashboard" : "Start free"}
            </Link>
          </Button>
        </Card>
      </div>
    </section>
  );
}

function FinalCta({ isAuthenticated }: { isAuthenticated: boolean }) {
  return (
    <section className="border-t border-border">
      <div className="mx-auto flex w-full max-w-6xl flex-col items-center gap-5 px-6 py-20 text-center">
        <h2 className="text-3xl font-semibold tracking-tight">
          {isAuthenticated
            ? "Pick up where you left off."
            : "Set up your workspace in under a minute."}
        </h2>
        <Button size="lg" asChild>
          <Link href={isAuthenticated ? "/dashboard" : "/signup"}>
            {isAuthenticated ? "Go to dashboard" : "Start free"} <ArrowRight className="size-4" />
          </Link>
        </Button>
      </div>
    </section>
  );
}

