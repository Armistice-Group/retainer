import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { MONTHLY_PRICE_USD, YEARLY_PRICE_USD } from "@/lib/pricing";
import {
  VsPageShell,
  VsHero,
  VsDisclosure,
  VsTable,
  VsSection,
  VsCrossLink,
  type VsRow,
} from "@/components/marketing/vs-page";

const TITLE = "Consultainer vs Bonsai";
const DESCRIPTION =
  "Bonsai is built for solo freelancers. Consultainer is built for the consulting team you're actually running — multiple people, one client, real bill rates.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/vs/bonsai" },
  openGraph: { title: TITLE, description: DESCRIPTION, type: "website", url: "/vs/bonsai" },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION },
};

const COMPARISON: VsRow[] = [
  { label: "Built for", consultainer: "Consulting teams", competitor: "Solo freelancers" },
  {
    label: "Per-person bill rates on a shared project",
    consultainer: "Native",
    competitor: "Not built for this",
  },
  {
    label: "Budget hours vs. logged hours tracking",
    consultainer: "Built in",
    competitor: "—",
  },
  {
    label: "Retainer / recurring invoicing",
    consultainer: "Built in, with a billed-vs-logged balance",
    competitor: "Built in",
  },
  {
    label: "Overdue invoice tracking",
    consultainer: "Built in",
    competitor: "Automated reminders",
  },
  {
    label: "Client portal",
    consultainer: "Read-only share link, no login",
    competitor: "Built in",
  },
  {
    label: "Proposals & e-signed contracts",
    consultainer: "Not built yet",
    competitor: "Built in",
  },
  {
    label: "Built-in payment collection",
    consultainer: "On the roadmap",
    competitor: "Built in",
  },
  { label: "Client intake forms", consultainer: "Not built", competitor: "Built in" },
  { label: "Scheduling / booking", consultainer: "Not built", competitor: "Built in" },
  {
    label: "Dev-tool integrations (Linear, QuickBooks)",
    consultainer: "Native",
    competitor: "—",
  },
  { label: "AI agent access (MCP)", consultainer: "Native MCP server", competitor: "—" },
];

export default async function BonsaiComparisonPage() {
  const session = await auth();
  const isAuthenticated = !!session?.user;

  return (
    <VsPageShell isAuthenticated={isAuthenticated}>
      <VsHero
        eyebrow={"// Consultainer vs Bonsai"}
        headline={
          <>
            Bonsai is for solo freelancers.
            <br />
            Consultainer is for the team you&apos;re building.
          </>
        }
        intro={
          <>
            Bonsai (now owned by Zoom) is a solid all-in-one workspace if you&apos;re one person
            billing for your own time. The moment you add a second consultant billing a
            different rate on the same client, it stops being the tool built for that. That&apos;s
            the entire reason Consultainer exists.
          </>
        }
        isAuthenticated={isAuthenticated}
      />

      <VsDisclosure>
        <span className="font-medium text-foreground">Upfront, so this stays honest:</span>{" "}
        Bonsai has real features Consultainer doesn&apos;t have yet — e-signed proposals and
        contracts, built-in payment collection, client intake forms, and scheduling. If
        you&apos;re a true solo freelancer who needs those today, Bonsai is a reasonable choice.
        Keep reading if you&apos;re not solo.
      </VsDisclosure>

      <VsTable
        competitorName="Bonsai"
        rows={COMPARISON}
        note="Based on Bonsai's publicly listed features as of August 2026. Bonsai's product changes over time, especially post-acquisition — if something here is out of date, tell us."
      />

      <VsSection heading="The problem Bonsai doesn't solve" muted>
        <p>
          Say you&apos;re running a two-person shop. You bill $175/hr, your contractor bills
          $110/hr, and you&apos;re both logging time against the same client&apos;s project.
          Bonsai was built around one person&apos;s invoices, one person&apos;s rate. You end up
          tracking who worked what hours at what rate in a spreadsheet next to it — which is
          the exact problem an all-in-one tool is supposed to remove.
        </p>
        <p>
          In Consultainer, every project carries its own team, and every person on it has their
          own bill rate. Time gets logged against the person who did it, invoices pull the right
          rate automatically, and nobody reconciles a spreadsheet on the side.
        </p>
      </VsSection>

      <VsSection heading="The actual pricing math">
        <p>
          Bonsai charges <span className="text-foreground">per user, per month</span>: roughly
          $9–15/user on their Basic tier up to $49–59/user on Elite, depending on the plan and
          whether you bill monthly or annually (annual billing runs about 40% cheaper).
          Consultainer charges a{" "}
          <span className="text-foreground">
            flat ${MONTHLY_PRICE_USD.toFixed(2)}/mo per organization
          </span>{" "}
          (or ${YEARLY_PRICE_USD.toFixed(2)}/yr) — the price doesn&apos;t change whether it&apos;s
          you or you and four other people.
        </p>
        <p>
          That cuts both ways, and we&apos;d rather say so than dodge it. If you&apos;re truly
          one person and only need Bonsai&apos;s Basic tier, its entry price can undercut
          Consultainer&apos;s flat rate. The math flips fast once you&apos;re not solo: three
          people on Bonsai&apos;s Essentials tier (proposals, contracts, scheduling) runs
          somewhere around $55–75/mo depending on billing frequency — before you add a fourth.
          Consultainer stays ${MONTHLY_PRICE_USD.toFixed(2)}/mo whether it&apos;s three people or
          thirty.
        </p>
        <p>
          For a solo consultant, Bonsai&apos;s entry tier may genuinely be the cheaper choice —
          this isn&apos;t a page trying to talk you out of that if it&apos;s true for you.
          It&apos;s the moment you add a second billable person that the math (and the product)
          starts working against you.
        </p>
        <p className="text-xs">
          Bonsai figures are per their publicly listed pricing pages as of August 2026 — plans
          and prices change, so confirm current numbers on their site before you commit either
          way.
        </p>
      </VsSection>

      <VsCrossLink />
    </VsPageShell>
  );
}
