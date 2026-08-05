import { auth } from "@/lib/auth";
import { LandingPage } from "@/components/marketing/landing-page";
import { MONTHLY_PRICE_USD } from "@/lib/pricing";

const JSON_LD = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Consultainer",
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web",
  description:
    "Client, project, time, and invoice management for engineering consultancies, built with a REST API and MCP server for AI coding agents like Claude Code, Cursor, and Codex.",
  offers: {
    "@type": "Offer",
    price: MONTHLY_PRICE_USD.toFixed(2),
    priceCurrency: "USD",
    priceValidUntil: "2027-12-31",
  },
  publisher: {
    "@type": "Organization",
    name: "Armistice Group LLC",
    url: "https://consultainer.app",
  },
};

export default async function Home() {
  const session = await auth();

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }}
      />
      <LandingPage isAuthenticated={!!session?.user} />
    </>
  );
}
