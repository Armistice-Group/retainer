import { Body, Button, Container, Head, Heading, Html, Preview, Text } from "@react-email/components";
import { EmailLogo } from "./email-logo";

export function VerifySignupEmail({
  verifyUrl,
  orgName,
  joiningExisting,
  origin,
}: {
  verifyUrl: string;
  orgName: string;
  joiningExisting: boolean;
  origin: string;
}) {
  return (
    <Html>
      <Head />
      <Preview>Confirm your email to {joiningExisting ? "join" : "create"} {orgName}</Preview>
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
          <Heading style={{ fontSize: 20, margin: "0 0 16px" }}>Confirm your email</Heading>
          <Text style={{ fontSize: 14, color: "#3f3a52", lineHeight: 1.6 }}>
            {joiningExisting
              ? `Click below to confirm this is your email and join ${orgName} on Consultainer.`
              : `Click below to confirm this is your email and finish creating ${orgName} on Consultainer.`}{" "}
            This link expires in 24 hours and can only be used once.
          </Text>
          <Button
            href={verifyUrl}
            style={{
              backgroundColor: "#7c5cf4",
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
            Confirm email
          </Button>
          <Text style={{ fontSize: 12, color: "#847da0", marginTop: 24 }}>
            Or paste this link into your browser: {verifyUrl}
          </Text>
          <Text style={{ fontSize: 12, color: "#847da0", marginTop: 12 }}>
            Didn&apos;t sign up for this? You can safely ignore this email — nothing has been
            created yet.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
