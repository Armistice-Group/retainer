import { Document, Page, Text, View, Image, StyleSheet, renderToBuffer } from "@react-pdf/renderer";
import type { Prisma } from "@/generated/prisma/client";

export type InvoiceForPdf = Prisma.InvoiceGetPayload<{
  include: {
    client: true;
    org: true;
    lineItems: true;
  };
}>;

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 10, color: "#1a1a1a", fontFamily: "Helvetica" },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 32 },
  logo: { maxWidth: 160, maxHeight: 60, marginBottom: 4, objectFit: "contain" },
  orgName: { fontSize: 16, fontWeight: 700, marginBottom: 4 },
  invoiceTitle: { fontSize: 20, fontWeight: 700, textAlign: "right" },
  invoiceMeta: { fontSize: 10, textAlign: "right", color: "#555", marginTop: 4 },
  section: { marginBottom: 24 },
  label: { fontSize: 8, color: "#888", textTransform: "uppercase", marginBottom: 2 },
  billToRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 24 },
  table: { marginTop: 8 },
  tableHeader: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#1a1a1a",
    paddingBottom: 6,
    marginBottom: 6,
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: "#ddd",
    paddingVertical: 6,
  },
  colDesc: { flex: 4 },
  colQty: { flex: 1, textAlign: "right" },
  colRate: { flex: 1, textAlign: "right" },
  colAmount: { flex: 1, textAlign: "right" },
  headerText: { fontSize: 8, textTransform: "uppercase", color: "#888" },
  totalsBlock: { marginTop: 16, alignItems: "flex-end" },
  totalsRow: { flexDirection: "row", width: 200, justifyContent: "space-between", paddingVertical: 2 },
  totalsLabel: { color: "#555" },
  grandTotalRow: {
    flexDirection: "row",
    width: 200,
    justifyContent: "space-between",
    paddingTop: 6,
    marginTop: 4,
    borderTopWidth: 1,
    borderTopColor: "#1a1a1a",
  },
  grandTotalLabel: { fontWeight: 700 },
  grandTotalValue: { fontWeight: 700 },
  notes: { marginTop: 32, fontSize: 9, color: "#555" },
});

function formatCurrency(amount: number | string | { toString(): string }, currency: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(
    Number(amount.toString())
  );
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("en-US", { year: "numeric", month: "long", day: "numeric" }).format(date);
}

const PAYMENT_TERMS_LABELS: Record<string, string> = {
  DUE_ON_RECEIPT: "Due on receipt",
  NET15: "Net 15",
  NET30: "Net 30",
  NET45: "Net 45",
  NET60: "Net 60",
  NET90: "Net 90",
  CUSTOM: "Custom",
};

export function InvoiceDocument({ invoice }: { invoice: InvoiceForPdf }) {
  const accentColor = invoice.org.brandColor || "#1a1a1a";
  const billEmail = invoice.client.billingEmail || invoice.client.email;
  const billAddress = invoice.client.billingAddress || invoice.client.address;
  const logoSrc = invoice.org.logoData
    ? `data:${invoice.org.logoContentType};base64,${Buffer.from(invoice.org.logoData).toString("base64")}`
    : invoice.org.logoUrl;

  return (
    <Document title={`Invoice ${invoice.number}`}>
      <Page size="A4" style={styles.page}>
        <View style={styles.headerRow}>
          <View>
            {logoSrc ? (
              // eslint-disable-next-line jsx-a11y/alt-text -- react-pdf's Image has no alt prop
              <Image src={logoSrc} style={styles.logo} />
            ) : (
              <Text style={styles.orgName}>{invoice.org.name}</Text>
            )}
          </View>
          <View>
            <Text style={[styles.invoiceTitle, { color: accentColor }]}>INVOICE</Text>
            <Text style={styles.invoiceMeta}>{invoice.number}</Text>
            {invoice.poNumber ? (
              <Text style={styles.invoiceMeta}>PO {invoice.poNumber}</Text>
            ) : null}
          </View>
        </View>

        <View style={styles.billToRow}>
          <View>
            <Text style={styles.label}>Bill To</Text>
            <Text>{invoice.client.name}</Text>
            {billEmail ? <Text>{billEmail}</Text> : null}
            {billAddress ? <Text>{billAddress}</Text> : null}
          </View>
          <View>
            <Text style={styles.label}>Issue Date</Text>
            <Text>{formatDate(invoice.issueDate)}</Text>
            <View style={{ height: 8 }} />
            <Text style={styles.label}>Due Date</Text>
            <Text>{formatDate(invoice.dueDate)}</Text>
            <View style={{ height: 8 }} />
            <Text style={styles.label}>Terms</Text>
            <Text>{PAYMENT_TERMS_LABELS[invoice.paymentTerms]}</Text>
          </View>
        </View>

        <View style={styles.table}>
          <View style={[styles.tableHeader, { borderBottomColor: accentColor }]}>
            <Text style={[styles.colDesc, styles.headerText]}>Description</Text>
            <Text style={[styles.colQty, styles.headerText]}>Qty</Text>
            <Text style={[styles.colRate, styles.headerText]}>Rate</Text>
            <Text style={[styles.colAmount, styles.headerText]}>Amount</Text>
          </View>
          {invoice.lineItems.map((item) => (
            <View style={styles.tableRow} key={item.id}>
              <Text style={styles.colDesc}>{item.description}</Text>
              <Text style={styles.colQty}>{Number(item.quantity)}</Text>
              <Text style={styles.colRate}>{formatCurrency(item.rate, invoice.currency)}</Text>
              <Text style={styles.colAmount}>{formatCurrency(item.amount, invoice.currency)}</Text>
            </View>
          ))}
        </View>

        <View style={styles.totalsBlock}>
          <View style={styles.totalsRow}>
            <Text style={styles.totalsLabel}>Subtotal</Text>
            <Text>{formatCurrency(invoice.subtotal, invoice.currency)}</Text>
          </View>
          <View style={styles.totalsRow}>
            <Text style={styles.totalsLabel}>Tax ({Number(invoice.taxRate)}%)</Text>
            <Text>{formatCurrency(invoice.taxAmount, invoice.currency)}</Text>
          </View>
          <View style={[styles.grandTotalRow, { borderTopColor: accentColor }]}>
            <Text style={styles.grandTotalLabel}>Total</Text>
            <Text style={[styles.grandTotalValue, { color: accentColor }]}>
              {formatCurrency(invoice.total, invoice.currency)}
            </Text>
          </View>
        </View>

        {invoice.notes ? (
          <View style={styles.notes}>
            <Text style={styles.label}>Notes</Text>
            <Text>{invoice.notes}</Text>
          </View>
        ) : null}
      </Page>
    </Document>
  );
}

export async function renderInvoicePdf(invoice: InvoiceForPdf) {
  return renderToBuffer(<InvoiceDocument invoice={invoice} />);
}
