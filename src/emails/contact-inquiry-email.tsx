import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Text,
} from "@react-email/components";
import { EmailLogo } from "./email-logo";

export function ContactInquiryEmail({
  name,
  email,
  company,
  message,
  origin,
}: {
  name: string;
  email: string;
  company: string | null;
  message: string;
  origin: string;
}) {
  return (
    <Html>
      <Head />
      <Preview>
        New contact inquiry from {name}
      </Preview>
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
          <Heading style={{ fontSize: 20, margin: "0 0 16px" }}>New contact inquiry</Heading>
          <Text style={{ fontSize: 14, color: "#3f3a52", lineHeight: 1.6 }}>
            <strong>{name}</strong> ({email}){company ? ` — ${company}` : ""} sent this via the
            Consultainer contact form:
          </Text>
          <Text
            style={{
              fontSize: 14,
              color: "#3f3a52",
              lineHeight: 1.6,
              whiteSpace: "pre-wrap",
              backgroundColor: "#f4f2fb",
              borderRadius: 8,
              padding: "12px 16px",
            }}
          >
            {message}
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
