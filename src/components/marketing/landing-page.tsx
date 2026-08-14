import Link from "next/link";
import {
  Building2,
  GitBranch,
  Clock,
  FileText,
  Bot,
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
    body: "Every client's contacts, links, and history in one place — not scattered across old email threads.",
  },
  {
    icon: GitBranch,
    title: "Projects, tasks & Linear",
    body: "Projects carry their own team and bill rate, synced straight from Linear, so hours never post at the wrong rate.",
  },
  {
    icon: Clock,
    title: "Time tracking",
    body: "Log hours as you go, override the rate when it's not standard — nothing billable slips through unlogged.",
  },
  {
    icon: FileText,
    title: "Milestones, invoicing & QuickBooks",
    body: "Bill hourly from logged time or fixed-price with evidence attached, then send a PDF or push to QuickBooks same-day.",
  },
] as const;

export function LandingPage({ isAuthenticated }: { isAuthenticated: boolean }) {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <SiteHeader isAuthenticated={isAuthenticated} />
      <main className="flex-1">
        <Hero isAuthenticated={isAuthenticated} />
        <PainPath />
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
          You did the work. Did you get paid for all of it?
        </h1>
        <p className="mt-5 max-w-lg text-lg leading-relaxed text-muted-foreground">
          Every unlogged hour and late invoice is money walking out the door.
          Consultainer closes the gap — automatically.
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

      <EngagementSnapshot />
    </section>
  );
}

function EngagementSnapshot() {
  return (
    <Card className="gap-0 overflow-hidden p-0 shadow-sm">
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <div>
          <p className="text-sm font-medium">Fintra Labs — API v2</p>
          <p className="text-xs text-muted-foreground">Synced from Linear</p>
        </div>
        <Badge variant="outline" className="font-normal">
          Active
        </Badge>
      </div>
      <div className="flex flex-col divide-y divide-border px-5">
        <div className="flex items-center justify-between py-3 text-sm">
          <span className="text-muted-foreground">Hours this week</span>
          <span className="tabular-figures font-medium">12.50h</span>
        </div>
        <div className="flex items-center justify-between py-3 text-sm">
          <span className="text-muted-foreground">Open tasks</span>
          <span className="tabular-figures font-medium">2</span>
        </div>
        <div className="flex items-center justify-between py-3 text-sm">
          <span className="text-muted-foreground">Draft invoice</span>
          <span className="tabular-figures font-medium">$2,100.00</span>
        </div>
      </div>
      <div className="flex items-center justify-between border-t border-border bg-muted/40 px-5 py-4">
        <span className="text-sm text-muted-foreground">Client, tasks, time, invoice</span>
        <span className="text-sm font-semibold">One place</span>
      </div>
    </Card>
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

const PAIN_STEPS = [
  {
    who: "You (or Claude Code, Codex, Cursor)",
    action: "ship the fix and close out the PR.",
  },
  {
    who: "You, later",
    action: "switch to Linear and mark the task done — if you remember to.",
  },
  {
    who: "You, at invoice time",
    action: "switch to a timer or spreadsheet and reconstruct the hours from memory.",
  },
  {
    who: "You, again",
    action: "switch to an invoicing tool and rebuild every line item by hand, hoping the rate's right.",
  },
] as const;

function PainPath() {
  return (
    <section className="border-y border-border bg-card/40">
      <div className="mx-auto w-full max-w-6xl px-6 py-20">
        <div className="mb-10 max-w-xl">
          <p className="font-mono text-xs tracking-wide text-primary/70 uppercase">
            The path we&apos;re replacing
          </p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight text-balance">
            Four tools, four context switches, one invoice built from memory
          </h2>
        </div>
        <div className="grid gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-4">
          {PAIN_STEPS.map((step, i) => (
            <div key={step.action} className="flex flex-col gap-2 bg-background p-5">
              <span className="font-mono text-xs text-muted-foreground">0{i + 1}</span>
              <p className="text-sm leading-relaxed">
                <span className="text-foreground">{step.who}</span>{" "}
                <span className="text-muted-foreground">{step.action}</span>
              </p>
            </div>
          ))}
        </div>
        <p className="mt-6 max-w-2xl text-muted-foreground">
          Consultainer collapses this into one flow: the task syncs from Linear, the time your
          agent logs (or you log) ties straight to it, and the invoice drafts itself from
          what&apos;s actually unbilled — at the right rate, automatically.
        </p>
      </div>
    </section>
  );
}

function Features() {
  return (
    <section id="features" className="mx-auto w-full max-w-6xl px-6 py-20">
      <div className="mb-12 max-w-xl">
        <h2 className="text-3xl font-semibold tracking-tight">
          The parts of consulting that actually cost you money when they slip
        </h2>
        <p className="mt-3 text-muted-foreground">
          Not a generic timer with an invoice bolted on — every piece here exists
          because skipping it is how work goes unbilled.
        </p>
      </div>
      <div className="grid gap-10 lg:grid-cols-[1.1fr_1fr] lg:items-center">
        <div className="flex flex-col divide-y divide-border border-t border-border">
          {FEATURES.map((feature) => (
            <div key={feature.title} className="flex items-start gap-4 py-5">
              <feature.icon className="mt-0.5 size-4 shrink-0 text-primary" strokeWidth={1.75} />
              <div>
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
            Claude Code, Cursor, Codex, or any MCP-compatible agent can log the hours
            it just spent and draft the invoice itself — so billable work doesn&apos;t
            die in a terminal window nobody ever bills from.
          </p>
        </div>
        <AgentDemo />
      </div>
    </section>
  );
}

const COMPARISON = [
  { label: "Pricing", consultainer: "Flat per org", harvest: "Per user", toggl: "Per user" },
  {
    label: "Task sync (Linear)",
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
    <section id="comparison" className="border-y border-border bg-card/40">
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

