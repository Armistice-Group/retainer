import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import { EmailLogo } from "./email-logo";

export type DigestData = {
  orgName: string;
  weekLabel: string;
  stats: { label: string; value: string }[];
  sections: { title: string; lines: string[]; empty: string }[];
  url: string;
  origin: string;
};

/** Monday summary of the week before, for owners and admins. */
export function DigestEmail({ orgName, weekLabel, stats, sections, url, origin }: DigestData) {
  return (
    <Html>
      <Head />
      <Preview>
        {orgName}: week of {weekLabel} — {stats.map((s) => `${s.label} ${s.value}`).join(", ")}
      </Preview>
      <Body style={{ fontFamily: "sans-serif", backgroundColor: "#f9f8fc", padding: "40px 0" }}>
        <Container
          style={{ backgroundColor: "#ffffff", borderRadius: 12, padding: "32px 40px", maxWidth: 560 }}
        >
          <EmailLogo origin={origin} />
          <Heading style={{ fontSize: 20, margin: "0 0 4px" }}>Your week at {orgName}</Heading>
          <Text style={{ fontSize: 13, color: "#8a8599", margin: "0 0 16px" }}>Week of {weekLabel}</Text>
          <Section>
            {stats.map((s) => (
              <Text key={s.label} style={{ fontSize: 14, color: "#3f3a52", margin: "2px 0" }}>
                <strong>{s.value}</strong> {s.label}
              </Text>
            ))}
          </Section>
          {sections.map((section) => (
            <Section key={section.title}>
              <Hr style={{ borderColor: "#ece9f3", margin: "20px 0 12px" }} />
              <Text style={{ fontSize: 14, fontWeight: 600, margin: "0 0 6px" }}>{section.title}</Text>
              {section.lines.length ? (
                section.lines.map((line, i) => (
                  <Text key={i} style={{ fontSize: 13, color: "#3f3a52", margin: "2px 0" }}>
                    {line}
                  </Text>
                ))
              ) : (
                <Text style={{ fontSize: 13, color: "#8a8599", margin: "2px 0" }}>{section.empty}</Text>
              )}
            </Section>
          ))}
          <Button
            href={url}
            style={{
              backgroundColor: "#4f6df5",
              color: "#ffffff",
              padding: "10px 20px",
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 600,
              textDecoration: "none",
              display: "inline-block",
              marginTop: 20,
            }}
          >
            Open Reports
          </Button>
          <Text style={{ fontSize: 12, color: "#8a8599", marginTop: 24 }}>
            Turn this off under Settings → Alerts.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
