import { Body, Button, Container, Head, Heading, Html, Preview, Text } from "@react-email/components";

export function ConfirmEmailChangeEmail({ confirmUrl }: { confirmUrl: string }) {
  return (
    <Html>
      <Head />
      <Preview>Confirm your new email for Consultainer</Preview>
      <Body style={{ fontFamily: "sans-serif", backgroundColor: "#f9f8fc", padding: "40px 0" }}>
        <Container
          style={{
            backgroundColor: "#ffffff",
            borderRadius: 12,
            padding: "32px 40px",
            maxWidth: 480,
          }}
        >
          <Heading style={{ fontSize: 20, margin: "0 0 16px" }}>Confirm your new email</Heading>
          <Text style={{ fontSize: 14, color: "#3f3a52", lineHeight: 1.6 }}>
            Click below to confirm this is your email and switch your Consultainer account to it.
            This link expires in 24 hours and can only be used once.
          </Text>
          <Button
            href={confirmUrl}
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
            Or paste this link into your browser: {confirmUrl}
          </Text>
          <Text style={{ fontSize: 12, color: "#847da0", marginTop: 12 }}>
            Didn&apos;t request this? Someone may have your password — change it and ignore this
            email.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
