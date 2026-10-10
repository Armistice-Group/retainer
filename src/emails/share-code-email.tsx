import { Body, Container, Head, Heading, Html, Preview, Text } from "@react-email/components";
import { EmailLogo } from "./email-logo";

/** The 6-digit code a client contact types on a share page. */
export function ShareCodeEmail({
  code,
  orgName,
  name,
  origin,
}: {
  code: string;
  orgName: string;
  name: string;
  origin: string;
}) {
  return (
    <Html>
      <Head />
      <Preview>{`Your code for ${orgName}'s client page: ${code}`}</Preview>
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
          <Heading style={{ fontSize: 20, margin: "0 0 16px" }}>Your verification code</Heading>
          <Text style={{ fontSize: 14, color: "#3f3a52", lineHeight: 1.6 }}>
            Hi {name}, enter this code to open the page {orgName} shared with you. It expires in
            10 minutes and can only be used once.
          </Text>
          <Text
            style={{
              fontSize: 28,
              fontWeight: 700,
              letterSpacing: 6,
              color: "#1f1b2e",
              margin: "16px 0",
              fontFamily: "monospace",
            }}
          >
            {code}
          </Text>
          <Text style={{ fontSize: 12, color: "#847da0", marginTop: 24 }}>
            Didn&apos;t ask for this? You can ignore this email; nobody gets in without the code.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
