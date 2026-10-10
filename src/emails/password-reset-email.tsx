import { Body, Button, Container, Head, Heading, Html, Preview, Text } from "@react-email/components";
import { EmailLogo } from "./email-logo";

export function PasswordResetEmail({
  name,
  resetUrl,
  origin,
  expiresIn,
  createdBy,
}: {
  name: string;
  resetUrl: string;
  origin: string;
  expiresIn: string;
  /** Set when an owner/admin created the link from Settings → Members. */
  createdBy?: { name: string; orgName: string };
}) {
  return (
    <Html>
      <Head />
      <Preview>Reset your Consultainer password</Preview>
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
          <Heading style={{ fontSize: 20, margin: "0 0 16px" }}>Reset your password</Heading>
          <Text style={{ fontSize: 14, color: "#3f3a52", lineHeight: 1.6 }}>
            Hi {name},{" "}
            {createdBy
              ? `${createdBy.name} (${createdBy.orgName}) created a password reset link for your Consultainer account.`
              : "someone asked to reset the password for your Consultainer account."}{" "}
            Click the button below to choose a new one. This link expires in {expiresIn} and can
            only be used once.
          </Text>
          <Button
            href={resetUrl}
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
            Choose a new password
          </Button>
          <Text style={{ fontSize: 12, color: "#847da0", marginTop: 24 }}>
            Or paste this link into your browser: {resetUrl}
          </Text>
          <Text style={{ fontSize: 12, color: "#847da0", marginTop: 12 }}>
            {createdBy
              ? "Not expecting this? Check with them before using it — if you ignore it, your password stays the same."
              : "Didn't ask for this? You can ignore this email — your password stays the same."}{" "}
            If you use two-factor authentication, you&apos;ll still need your code to log in.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
