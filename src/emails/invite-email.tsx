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

export function InviteEmail({
  orgName,
  inviterName,
  inviteUrl,
  origin,
}: {
  orgName: string;
  inviterName: string;
  inviteUrl: string;
  origin: string;
}) {
  return (
    <Html>
      <Head />
      <Preview>{inviterName} invited you to join {orgName} on Consultainer</Preview>
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
          <Heading style={{ fontSize: 20, margin: "0 0 16px" }}>
            Join {orgName} on Consultainer
          </Heading>
          <Text style={{ fontSize: 14, color: "#3f3a52", lineHeight: 1.6 }}>
            {inviterName} invited you to collaborate on clients, projects, and time tracking in{" "}
            {orgName}&apos;s Consultainer workspace.
          </Text>
          <Button
            href={inviteUrl}
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
            Accept invite
          </Button>
          <Text style={{ fontSize: 12, color: "#847da0", marginTop: 24 }}>
            Or paste this link into your browser: {inviteUrl}
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
