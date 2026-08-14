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

export function InvoiceStatusEmail({
  orgName,
  invoiceNumber,
  clientName,
  total,
  status,
  invoiceUrl,
  origin,
}: {
  orgName: string;
  invoiceNumber: string;
  clientName: string;
  total: string;
  status: "sent" | "paid";
  invoiceUrl: string;
  origin: string;
}) {
  const headline = status === "paid" ? "Invoice paid" : "Invoice sent";
  const body =
    status === "paid"
      ? `${clientName} has paid invoice ${invoiceNumber} (${total}).`
      : `Invoice ${invoiceNumber} (${total}) for ${clientName} has been marked as sent.`;

  return (
    <Html>
      <Head />
      <Preview>
        {headline}: {invoiceNumber} — {orgName}
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
          <Heading style={{ fontSize: 20, margin: "0 0 16px" }}>{headline}</Heading>
          <Text style={{ fontSize: 14, color: "#3f3a52", lineHeight: 1.6 }}>{body}</Text>
          <Button
            href={invoiceUrl}
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
            View invoice
          </Button>
        </Container>
      </Body>
    </Html>
  );
}
