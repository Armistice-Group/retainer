import { Document, Page, Text, View, Image, StyleSheet, renderToBuffer } from "@react-pdf/renderer";
import type { Prisma } from "@/generated/prisma/client";

export type CreditNoteForPdf = Prisma.CreditNoteGetPayload<{
  include: { client: true; org: true; invoice: { select: { number: true } } };
}>;

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 10, color: "#1a1a1a", fontFamily: "Helvetica" },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 32 },
  logo: { maxWidth: 160, maxHeight: 60, marginBottom: 4, objectFit: "contain" },
  orgName: { fontSize: 16, fontWeight: 700, marginBottom: 4 },
  title: { fontSize: 20, fontWeight: 700, textAlign: "right" },
  meta: { fontSize: 10, textAlign: "right", color: "#555", marginTop: 4 },
  label: { fontSize: 8, color: "#888", textTransform: "uppercase", marginBottom: 2 },
  row: { flexDirection: "row", justifyContent: "space-between", marginBottom: 24 },
  reason: { marginBottom: 24, lineHeight: 1.4 },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignSelf: "flex-end",
    width: 220,
    paddingTop: 6,
    borderTopWidth: 1,
  },
  bold: { fontWeight: 700 },
  void: { marginTop: 24, fontSize: 12, fontWeight: 700, color: "#b91c1c" },
  footer: { marginTop: 32, fontSize: 9, color: "#555" },
});

function formatCurrency(amount: { toString(): string }, currency: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(Number(amount.toString()));
}

// Date-only column stored as UTC midnight: format in UTC.
function formatDate(date: Date) {
  return new Intl.DateTimeFormat("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" }).format(date);
}

export function CreditNoteDocument({ note }: { note: CreditNoteForPdf }) {
  const accentColor = note.org.brandColor || "#1a1a1a";
  const billEmail = note.client.billingEmail || note.client.email;
  const billAddress = note.client.billingAddress || note.client.address;
  const logoSrc = note.org.logoData
    ? `data:${note.org.logoContentType};base64,${Buffer.from(note.org.logoData).toString("base64")}`
    : note.org.logoUrl;

  return (
    <Document title={`Credit note ${note.number}`}>
      <Page size="A4" style={styles.page}>
        <View style={styles.headerRow}>
          <View>
            {logoSrc ? (
              // eslint-disable-next-line jsx-a11y/alt-text -- react-pdf's Image has no alt prop
              <Image src={logoSrc} style={styles.logo} />
            ) : (
              <Text style={styles.orgName}>{note.org.name}</Text>
            )}
          </View>
          <View>
            <Text style={[styles.title, { color: accentColor }]}>CREDIT NOTE</Text>
            <Text style={styles.meta}>{note.number}</Text>
            {note.invoice ? <Text style={styles.meta}>Against invoice {note.invoice.number}</Text> : null}
          </View>
        </View>

        <View style={styles.row}>
          <View>
            <Text style={styles.label}>Credit To</Text>
            <Text>{note.client.name}</Text>
            {billEmail ? <Text>{billEmail}</Text> : null}
            {billAddress ? <Text>{billAddress}</Text> : null}
          </View>
          <View>
            <Text style={styles.label}>Issue Date</Text>
            <Text>{formatDate(note.issueDate)}</Text>
          </View>
        </View>

        <View style={styles.reason}>
          <Text style={styles.label}>Reason</Text>
          <Text>{note.reason}</Text>
        </View>

        <View style={[styles.totalRow, { borderTopColor: accentColor }]}>
          <Text style={styles.bold}>Credit</Text>
          <Text style={[styles.bold, { color: accentColor }]}>{formatCurrency(note.amount, note.currency)}</Text>
        </View>

        {note.status === "VOID" ? <Text style={styles.void}>VOID — this credit note was cancelled.</Text> : null}

        <Text style={styles.footer}>
          This credit can be applied by {note.org.name} to your invoices. It isn&apos;t a refund.
        </Text>
      </Page>
    </Document>
  );
}

export async function renderCreditNotePdf(note: CreditNoteForPdf) {
  return renderToBuffer(<CreditNoteDocument note={note} />);
}
