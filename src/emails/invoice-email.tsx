import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Img,
  Preview,
  Text,
} from "@react-email/components";

/** The invoice as a client receives it: amount, due date, a link to view
 * and pay it, and (for open tracking) a 1×1 pixel. Also used for overdue
 * reminders. */
export function InvoiceEmail({
  orgName,
  logoUrl,
  invoiceNumber,
  total,
  dueDate,
  message,
  viewUrl,
  pixelUrl,
  reminder,
}: {
  orgName: string;
  logoUrl: string | null;
  invoiceNumber: string;
  total: string;
  dueDate: string;
  message: string | null;
  viewUrl: string;
  pixelUrl: string;
  /** Days overdue, for a reminder. */
  reminder?: number;
}) {
  const headline = reminder
    ? `Invoice ${invoiceNumber} is ${reminder} day${reminder === 1 ? "" : "s"} overdue`
    : `Invoice ${invoiceNumber} from ${orgName}`;
  return (
    <Html>
      <Head />
      <Preview>
        {headline} — {total} due {dueDate}
      </Preview>
      <Body style={{ fontFamily: "sans-serif", backgroundColor: "#f9f8fc", padding: "40px 0" }}>
        <Container
          style={{ backgroundColor: "#ffffff", borderRadius: 12, padding: "32px 40px", maxWidth: 520 }}
        >
          {logoUrl ? (
            <Img src={logoUrl} height="40" alt={orgName} style={{ marginBottom: 20 }} />
          ) : (
            <Text style={{ fontSize: 16, fontWeight: 600, margin: "0 0 20px" }}>{orgName}</Text>
          )}
          <Heading style={{ fontSize: 20, margin: "0 0 12px" }}>{headline}</Heading>
          <Text style={{ fontSize: 28, fontWeight: 600, margin: "0 0 4px" }}>{total}</Text>
          <Text style={{ fontSize: 14, color: "#5b5670", margin: "0 0 16px" }}>
            {reminder ? `Was due ${dueDate}` : `Due ${dueDate}`}
          </Text>
          {message
            ? message.split(/\n+/).map((para, i) => (
                <Text key={i} style={{ fontSize: 14, color: "#3f3a52", lineHeight: 1.6 }}>
                  {para}
                </Text>
              ))
            : null}
          <Button
            href={viewUrl}
            style={{
              backgroundColor: "#4f6df5",
              color: "#ffffff",
              padding: "12px 22px",
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 600,
              textDecoration: "none",
              display: "inline-block",
              marginTop: 8,
            }}
          >
            View invoice
          </Button>
          <Text style={{ fontSize: 12, color: "#8a8599", marginTop: 24 }}>
            Questions? Reply to this email.
          </Text>
          <Img src={pixelUrl} width="1" height="1" alt="" style={{ display: "block" }} />
        </Container>
      </Body>
    </Html>
  );
}
