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

export function ContractorReviewEmail({
  orgName,
  clientName,
  contractorName,
  projectName,
  reviewUrl,
  origin,
}: {
  orgName: string;
  clientName: string;
  contractorName: string;
  projectName: string;
  reviewUrl: string;
  origin: string;
}) {
  return (
    <Html>
      <Head />
      <Preview>
        Review {contractorName} for {projectName} — {orgName}
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
          <Heading style={{ fontSize: 20, margin: "0 0 16px" }}>Contractor review requested</Heading>
          <Text style={{ fontSize: 14, color: "#3f3a52", lineHeight: 1.6 }}>
            {orgName} would like {clientName} to review {contractorName} before they start work on{" "}
            {projectName}.
          </Text>
          <Button
            href={reviewUrl}
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
            Review {contractorName}
          </Button>
        </Container>
      </Body>
    </Html>
  );
}
