import { Body, Container, Head, Heading, Html, Preview, Text } from "@react-email/components";
import { EmailLogo } from "./email-logo";

/** Sent from Settings → Integrations to check email works. */
export function TestEmail({ fromAddress, origin }: { fromAddress: string; origin: string }) {
  return (
    <Html>
      <Head />
      <Preview>Email from Consultainer is working</Preview>
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
          <Heading style={{ fontSize: 20, margin: "0 0 16px" }}>Email is working</Heading>
          <Text style={{ fontSize: 14, color: "#3f3a52", lineHeight: 1.6 }}>
            This test came from {origin}, sent as {fromAddress}. Invoices, reminders, invites and
            login links will go out the same way.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
