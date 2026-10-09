import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Text,
} from "@react-email/components";
import { EmailLogo } from "./email-logo";

/** Every org alert (invoice opened, billing details changed, invoice paid…)
 * sent by lib/alerts. */
export function AlertEmail({
  orgName,
  headline,
  message,
  details = [],
  url,
  origin,
}: {
  orgName: string;
  headline: string;
  message: string;
  details?: string[];
  url: string;
  origin: string;
}) {
  return (
    <Html>
      <Head />
      <Preview>
        {headline} — {orgName}
      </Preview>
      <Body style={{ fontFamily: "sans-serif", backgroundColor: "#f9f8fc", padding: "40px 0" }}>
        <Container
          style={{ backgroundColor: "#ffffff", borderRadius: 12, padding: "32px 40px", maxWidth: 520 }}
        >
          <EmailLogo origin={origin} />
          <Heading style={{ fontSize: 20, margin: "0 0 16px" }}>{headline}</Heading>
          <Text style={{ fontSize: 14, color: "#3f3a52", lineHeight: 1.6 }}>{message}</Text>
          {details.map((line, i) => (
            <Text
              key={i}
              style={{ fontSize: 13, color: "#5b5670", lineHeight: 1.5, margin: "4px 0" }}
            >
              {line}
            </Text>
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
              marginTop: 16,
            }}
          >
            Open in Consultainer
          </Button>
          <Text style={{ fontSize: 12, color: "#8a8599", marginTop: 24 }}>
            {orgName} · Change which alerts you get under Settings → Alerts.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
