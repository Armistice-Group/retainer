import Link from "next/link";
import {
  Building2,
  GitBranch,
  Clock,
  FileText,
  Bot,
  Check,
  ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SiteHeader, SiteFooter, ClosingCta } from "@/components/marketing/site-chrome";
import { CookieNotice } from "@/components/cookie-notice";
import { PricingSection } from "@/components/marketing/pricing-section";
import { AgentDemo } from "@/components/marketing/agent-demo";

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
    title: "API & MCP for your AI agent",
    body: "A REST API and a real MCP server — see your tasks, log hours against them, or generate an invoice straight from Claude Code, Cursor, or any MCP-compatible agent, without opening a browser tab.",
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
        <Comparison />
        <Pricing isAuthenticated={isAuthenticated} />
        <ClosingCta isAuthenticated={isAuthenticated} />
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
          Built to ship engagements, not manage them.
        </h1>
        <p className="mt-5 max-w-lg text-lg leading-relaxed text-muted-foreground">
          Tasks synced from Linear, hours logged from your AI coding agent,
          invoices built from what actually shipped. Consultainer runs the
          engagement from the tools you already build in — not a separate app you
          have to remember to update.
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

      <AgentDemo />
    </section>
  );
}

function TaskPreview() {
  const tasks = [
    { title: "Rate limiting on /webhooks", status: "Done" },
    { title: "Fix invoice PDF pagination", status: "In progress" },
    { title: "Add SSO metadata endpoint", status: "In progress" },
    { title: "Write migration for org roles", status: "To do" },
  ] as const;

  const statusStyle: Record<(typeof tasks)[number]["status"], string> = {
    Done: "border-primary/30 bg-primary/10 text-primary",
    "In progress": "border-border bg-muted text-foreground",
    "To do": "border-border text-muted-foreground",
  };

  return (
    <Card className="gap-0 overflow-hidden p-0 shadow-sm">
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <div>
          <p className="text-sm font-medium">Fintra Labs — API v2</p>
          <p className="text-xs text-muted-foreground">Synced from Linear</p>
        </div>
        <GitBranch className="size-4 text-muted-foreground" strokeWidth={1.75} />
      </div>
      <div className="flex flex-col divide-y divide-border px-5">
        {tasks.map((task) => (
          <div key={task.title} className="flex items-center justify-between gap-3 py-3 text-sm">
            <span className="text-muted-foreground">{task.title}</span>
            <Badge variant="outline" className={`shrink-0 font-mono font-normal ${statusStyle[task.status]}`}>
              {task.status}
            </Badge>
          </div>
        ))}
      </div>
    </Card>
  );
}

function ReplacesRow() {
  const items = ["A timer app", "A separate invoicing tool", "A doc of client logins"];
  return (
    <section className="border-y border-border bg-card/40">
      <div className="mx-auto flex w-full max-w-6xl flex-col items-center gap-4 px-6 py-8 text-center sm:flex-row sm:justify-center sm:gap-6 sm:text-left">
        <p className="font-mono text-xs tracking-wide text-muted-foreground uppercase">
          Replaces:
        </p>
        <div className="flex flex-wrap items-center justify-center gap-2">
          {items.map((item, i) => (
            <span key={item} className="flex items-center gap-2">
              <Badge variant="outline" className="font-mono font-normal">
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
          Built for how engineering consulting actually runs
        </h2>
        <p className="mt-3 text-muted-foreground">
          Not a generic timer with an invoice bolted on — the parts of the job that
          actually take time to organize.
        </p>
      </div>
      <div className="grid gap-10 lg:grid-cols-[1.3fr_1fr] lg:items-start">
        <div className="flex flex-col divide-y divide-border border-t border-border">
          {FEATURES.map((feature, i) => (
            <div
              key={feature.title}
              className="grid grid-cols-[auto_auto_1fr] items-baseline gap-x-5 gap-y-2 py-6 sm:grid-cols-[3rem_auto_1fr] sm:items-start"
            >
              <span className="font-mono text-sm text-primary/60">
                {String(i + 1).padStart(2, "0")}
              </span>
              <feature.icon
                className="hidden size-4 self-start text-primary sm:mt-1 sm:block"
                strokeWidth={1.75}
              />
              <div className="col-span-2 sm:col-span-1">
                <h3 className="font-medium">{feature.title}</h3>
                <p className="mt-1 max-w-xl text-sm leading-relaxed text-muted-foreground">
                  {feature.body}
                </p>
              </div>
            </div>
          ))}
        </div>
        <TaskPreview />
      </div>
    </section>
  );
}

function McpSpotlight() {
  return (
    <section className="border-y border-border bg-card/40">
      <div className="mx-auto grid w-full max-w-6xl gap-10 px-6 py-20 lg:grid-cols-2 lg:items-center">
        <div>
          <Badge variant="outline" className="mb-4 font-mono font-normal">
            <Bot className="size-3.5" /> MCP server included
          </Badge>
          <h2 className="text-3xl font-semibold tracking-tight text-balance">
            Run the engagement from your AI agent.
          </h2>
          <p className="mt-4 text-muted-foreground">
            Consultainer ships with a real MCP server — connect Claude Code, Cursor,
            Codex, Gemini, or any MCP-compatible agent to manage clients and projects,
            milestones and expenses, tasks and time, and invoices, without opening a
            browser tab.
          </p>
        </div>
        <Card className="gap-3 p-5 font-mono text-sm">
          <p className="text-muted-foreground">
            &gt; Mark the design-system milestone complete for Fintra Labs
          </p>
          <p className="flex items-center gap-2 text-foreground">
            <Check className="size-4 shrink-0 text-chart-3" />
            Design system marked complete — ready to invoice
          </p>
          <p className="mt-2 text-muted-foreground">
            &gt; Log a $340 AWS expense on that project
          </p>
          <p className="flex items-center gap-2 text-foreground">
            <Check className="size-4 shrink-0 text-chart-3" />
            Expense submitted — auto-approved
          </p>
        </Card>
      </div>
    </section>
  );
}

const COMPARISON = [
  { label: "Pricing", consultainer: "Flat per org", harvest: "Per user", toggl: "Per user" },
  {
    label: "Client & engagement context",
    consultainer: "Built in",
    harvest: "Not built for this",
    toggl: "Not built for this",
  },
  {
    label: "Task sync (Linear, GitHub)",
    consultainer: "Native",
    harvest: "—",
    toggl: "—",
  },
  {
    label: "AI agent access (MCP)",
    consultainer: "Native MCP server",
    harvest: "—",
    toggl: "—",
  },
  {
    label: "Invoicing",
    consultainer: "Built in + QuickBooks push",
    harvest: "Built in",
    toggl: "Time tracking only",
  },
  {
    label: "Built for",
    consultainer: "Engineering consultancies",
    harvest: "Freelancers & agencies, general",
    toggl: "Teams & freelancers, general",
  },
] as const;

function Comparison() {
  return (
    <section className="border-y border-border bg-card/40">
      <div className="mx-auto w-full max-w-6xl px-6 py-20">
        <div className="mb-12 max-w-xl">
          <h2 className="text-3xl font-semibold tracking-tight text-balance">
            Not another timer with a client list bolted on
          </h2>
          <p className="mt-3 text-muted-foreground">
            Harvest and Toggl Track are built for logging hours. Consultainer is built
            around the engagement itself — the client, the tasks, and the invoice all
            live in the same place.
          </p>
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
                  Harvest
                </th>
                <th className="px-4 py-3 text-left font-mono font-normal text-muted-foreground">
                  Toggl Track
                </th>
              </tr>
            </thead>
            <tbody>
              {COMPARISON.map((row) => (
                <tr key={row.label} className="border-b border-border">
                  <td className="py-3 pr-4 text-muted-foreground">{row.label}</td>
                  <td className="border-x border-border bg-primary/5 px-4 py-3 font-medium text-foreground">
                    {row.consultainer}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{row.harvest}</td>
                  <td className="px-4 py-3 text-muted-foreground">{row.toggl}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function Pricing({ isAuthenticated }: { isAuthenticated: boolean }) {
  return (
    <div className="border-t border-border">
      <PricingSection isAuthenticated={isAuthenticated} />
      <div className="mx-auto w-full max-w-6xl px-6 pb-16">
        <Link href="/pricing" className="text-sm text-primary hover:underline">
          Full pricing details &amp; FAQ →
        </Link>
      </div>
    </div>
  );
}

