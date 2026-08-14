import { Body, Button, Container, Head, Heading, Html, Preview, Text } from "@react-email/components";
import { EmailLogo } from "./email-logo";

export function MagicLinkEmail({ loginUrl, origin }: { loginUrl: string; origin: string }) {
  return (
    <Html>
      <Head />
      <Preview>Your Consultainer login link</Preview>
      <Body style={{ fontFamily: "sans-serif", backgroundColor: "#f9f8fc", padding: "40px 0" }}>
        <Container
          style={{
            backgroundColor: "#ffffff",
            borderRadius: 12,
            padding: "32px 40px",
            maxWidth: 480,
          }}
        >
          <EmailLogo origin={origin} />
          <Heading style={{ fontSize: 20, margin: "0 0 16px" }}>Log in to Consultainer</Heading>
          <Text style={{ fontSize: 14, color: "#3f3a52", lineHeight: 1.6 }}>
            Click the button below to log in. This link expires in 15 minutes and can only be
            used once.
          </Text>
          <Button
            href={loginUrl}
            style={{
              backgroundColor: "#4f6df5",
              color: "#ffffff",
              padding: "10px 20px",
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 600,
              textDecoration: "none",
              display: "inline-block",
              marginTop: 12,
            }}
          >
            Log in
          </Button>
          <Text style={{ fontSize: 12, color: "#847da0", marginTop: 24 }}>
            Or paste this link into your browser: {loginUrl}
          </Text>
          <Text style={{ fontSize: 12, color: "#847da0", marginTop: 12 }}>
            Didn&apos;t request this? You can safely ignore this email.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
