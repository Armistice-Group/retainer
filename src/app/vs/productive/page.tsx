import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { MONTHLY_PRICE_USD } from "@/lib/pricing";
import {
  VsPageShell,
  VsHero,
  VsDisclosure,
  VsTable,
  VsSection,
  VsCrossLink,
  type VsRow,
} from "@/components/marketing/vs-page";

const TITLE = "Consultainer vs Productive.io";
const DESCRIPTION =
  "Productive.io is built to run a 50-person agency. Consultainer is built to run the small consulting team you actually have — without the enterprise PSA complexity or per-seat pricing.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/vs/productive" },
  openGraph: { title: TITLE, description: DESCRIPTION, type: "website", url: "/vs/productive" },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION },
};

const COMPARISON: VsRow[] = [
  {
    label: "Built for",
    consultainer: "Small consulting teams",
    competitor: "Agencies of any size, incl. 50+",
  },
  {
    label: "Per-person bill rates on a shared project",
    consultainer: "Native",
    competitor: "Native",
  },
  {
    label: "Budget hours vs. logged hours tracking",
    consultainer: "Built in",
    competitor: "Built in",
  },
  {
    label: "Profitability / margin reporting",
    consultainer: "Not built yet",
    competitor: "Built in",
  },
  {
    label: "Resource planning & forecasting",
    consultainer: "Not built",
    competitor: "Built in",
  },
  {
    label: "Sales pipeline / CRM",
    consultainer: "Not built",
    competitor: "Built in",
  },
  {
    label: "Retainer / recurring invoicing",
    consultainer: "Built in, with a billed-vs-logged balance",
    competitor: "Built in",
  },
  {
    label: "Client portal",
    consultainer: "Read-only share link, no login required",
    competitor: "Built in (account-based)",
  },
  {
    label: "Dev-tool integrations",
    consultainer: "Linear, QuickBooks",
    competitor: "Jira, Slack, QuickBooks, Calendar",
  },
  { label: "AI agent access (MCP)", consultainer: "Native MCP server", competitor: "—" },
  {
    label: "Pricing model",
    consultainer: "Flat per organization",
    competitor: "Per user, per month",
  },
];

export default async function ProductiveComparisonPage() {
  const session = await auth();
  const isAuthenticated = !!session?.user;

  return (
    <VsPageShell isAuthenticated={isAuthenticated}>
      <VsHero
        eyebrow={"// Consultainer vs Productive.io"}
        headline={
          <>
            Productive runs a 50-person agency.
            <br />
            You have three people.
          </>
        }
        intro={
          <>
            Productive.io is a genuinely capable platform — resource planning, forecasting, a
            sales pipeline, profitability reporting, the works. That&apos;s exactly the problem
            if you&apos;re a small consultancy: you&apos;re paying for and configuring an
            operations platform built for a business three times your size.
          </>
        }
        isAuthenticated={isAuthenticated}
      />

      <VsDisclosure>
        <span className="font-medium text-foreground">Upfront, so this stays honest:</span>{" "}
        Productive genuinely beats Consultainer on a few fronts today — profitability and
        margin reporting, resource forecasting across projects, and a built-in sales pipeline.
        If you need those specifically, and you have the headcount to justify running a full
        agency-ops platform, Productive is a legitimately strong choice. This page is for
        everyone else.
      </VsDisclosure>

      <VsTable
        competitorName="Productive"
        rows={COMPARISON}
        note="Based on Productive.io's publicly listed features and pricing tiers as of August 2026. If something here is out of date, tell us."
      />

      <VsSection heading="The problem isn't features. It's fit." muted>
        <p>
          Productive isn&apos;t weak on team billing the way a solo-freelancer tool is — it was
          built for agencies, so per-person rates, budgets, and time tracking all work fine
          there. The mismatch is scale. Its pricing tiers, resource-planning views, and sales
          pipeline all assume you&apos;re managing a roster, a pipeline, and utilization across
          a growing bench. A three-person consultancy doesn&apos;t have a bench. It has three
          people and a handful of clients.
        </p>
        <p>
          Consultainer skips the parts of the operations stack you don&apos;t need yet — sales
          pipeline, cross-project resource forecasting — and gets the parts you do need (team
          billing, budgets, retainers, invoicing, a client portal) working in minutes instead of
          a rollout.
        </p>
      </VsSection>

      <VsSection heading="The actual pricing math">
        <p>
          Productive charges <span className="text-foreground">per user, per month</span>:
          roughly $9–11/user on their Essential tier up to $24–28/user on Professional (advanced
          reporting and resource planning — likely the tier you&apos;d actually want), with
          custom pricing above that for larger teams. Consultainer charges a{" "}
          <span className="text-foreground">
            flat ${MONTHLY_PRICE_USD.toFixed(2)}/mo per organization
          </span>
          , regardless of headcount.
        </p>
        <p>
          Even at the cheapest tier, three people on Productive Essential runs roughly
          $27–33/mo — already above Consultainer&apos;s flat rate. On Professional, where the
          reporting and planning features that make Productive worth choosing actually live,
          three people runs $72–84/mo. Consultainer stays ${MONTHLY_PRICE_USD.toFixed(2)}/mo
          whether it&apos;s three people or thirty.
        </p>
        <p className="text-xs">
          Productive figures are per their publicly listed pricing pages as of August 2026 —
          confirm current numbers and which features sit behind which tier on their site before
          you commit either way.
        </p>
      </VsSection>

      <VsCrossLink />
    </VsPageShell>
  );
}
