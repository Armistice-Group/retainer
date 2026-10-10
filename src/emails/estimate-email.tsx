import { Body, Button, Container, Head, Heading, Html, Img, Preview, Text } from "@react-email/components";

/** An estimate as the client receives it: title, total, expiry and a link
 * to read it and accept or decline. */
export function EstimateEmail({
  orgName,
  logoUrl,
  estimateNumber,
  title,
  total,
  expiresAt,
  message,
  viewUrl,
}: {
  orgName: string;
  logoUrl: string | null;
  estimateNumber: string;
  title: string;
  total: string;
  expiresAt: string | null;
  message: string | null;
  viewUrl: string;
}) {
  return (
    <Html>
      <Head />
      <Preview>
        Estimate {estimateNumber} from {orgName}: {title} ({total})
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
          <Heading style={{ fontSize: 20, margin: "0 0 4px" }}>{title}</Heading>
          <Text style={{ fontSize: 14, color: "#5b5670", margin: "0 0 12px" }}>
            Estimate {estimateNumber} from {orgName}
          </Text>
          <Text style={{ fontSize: 28, fontWeight: 600, margin: "0 0 4px" }}>{total}</Text>
          {expiresAt ? (
            <Text style={{ fontSize: 14, color: "#5b5670", margin: "0 0 16px" }}>
              Valid until {expiresAt}
            </Text>
          ) : null}
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
            View estimate
          </Button>
          <Text style={{ fontSize: 12, color: "#8a8599", marginTop: 24 }}>
            You can accept or decline it from that page. Questions? Reply to this email.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
