import Link from "next/link";

const CONTACT_EMAIL = "support@consultainer.app";

const FAQS = [
  {
    q: "Is there a free trial on the paid plan?",
    a: "There's no time-limited trial — instead the Free plan works for real, indefinitely, for up to 2 clients and 1 user. Upgrade whenever you outgrow that, not before.",
  },
  {
    q: "Is pricing per seat?",
    a: "No. Consultainer is one flat price per organization with unlimited team members — adding people to your org never changes the bill.",
  },
  {
    q: "Do you offer discount codes?",
    a: "Yes — promo codes (new-customer offers, campaign codes, student/military discounts, etc.) can be applied at checkout. Ask us if you're eligible for one.",
  },
  {
    q: "Can I cancel anytime?",
    a: "Yes, from Settings → Billing. Your plan stays active through the end of the billing period you already paid for; there's no lock-in contract.",
  },
  {
    q: "What happens to my data if I cancel?",
    a: "Nothing is deleted on downgrade — your clients, projects, time entries, and invoices stay exactly as they are. You're just held to the Free plan's limits for new clients and users going forward.",
  },
  {
    q: "Where is my data stored, and is it secure?",
    a: (
      <>
        In a dedicated PostgreSQL database with encryption in transit and at rest. See our{" "}
        <Link href="/security" className="text-primary hover:underline">
          security page
        </Link>{" "}
        for details.
      </>
    ),
  },
  {
    q: "Can I switch from Harvest, FreshBooks, or a spreadsheet?",
    a: "Yes — there's no import tool yet, but clients, projects, and rates are quick to set up by hand, and nothing about switching requires touching your existing invoice history elsewhere.",
  },
  {
    q: "Do you integrate with QuickBooks and Linear?",
    a: "Yes. Push invoices straight to QuickBooks and keep their status in sync, and pull Linear issues into a project's task list. Both are optional — connect them from Settings → Integrations.",
  },
] as const;

// Schema.org requires plain-text answers — the "data stored" FAQ renders a
// <Link> in the UI, so it gets a plain-text equivalent here instead of the
// JSX one used for display.
const FAQ_PLAIN_TEXT_OVERRIDES: Record<string, string> = {
  "Where is my data stored, and is it secure?":
    "In a dedicated PostgreSQL database with encryption in transit and at rest. See our security page at /security for details.",
};

function faqJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQS.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: {
        "@type": "Answer",
        text: FAQ_PLAIN_TEXT_OVERRIDES[item.q] ?? (item.a as string),
      },
    })),
  };
}

export function FaqSection() {
  return (
    <section id="faq" className="mx-auto w-full max-w-6xl px-6 py-20">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd()) }}
      />
      <div className="mb-12 max-w-xl">
        <h2 className="text-3xl font-semibold tracking-tight">Frequently asked questions</h2>
        <p className="mt-3 text-muted-foreground">
          Can&apos;t find what you&apos;re looking for?{" "}
          <a href={`mailto:${CONTACT_EMAIL}`} className="text-primary hover:underline">
            Email us
          </a>
          .
        </p>
      </div>
      <div className="mx-auto flex max-w-3xl flex-col divide-y divide-border border-t border-border">
        {FAQS.map((item) => (
          <details key={item.q} className="group py-4">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium marker:content-none">
              {item.q}
              <span className="shrink-0 text-muted-foreground transition-transform group-open:rotate-45">
                +
              </span>
            </summary>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{item.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
