import { Document, Page, Text, View, Image, StyleSheet, renderToBuffer } from "@react-pdf/renderer";
import { parseSimpleMarkdown, inlineText } from "@/lib/simple-markdown";

type Num = { toString(): string } | number;

/** Just what the PDF shows — the same shape the client page loads, so the
 * PDF can't carry anything the page doesn't. */
export type EstimateForPdf = {
  number: string;
  title: string;
  intro: string | null;
  status: string;
  issueDate: Date;
  expiresAt: Date | null;
  currency: string;
  subtotal: Num;
  taxRate: Num;
  taxAmount: Num;
  total: Num;
  client: { name: string };
  org: {
    name: string;
    logoData: Uint8Array | null;
    logoUrl: string | null;
    logoContentType: string | null;
    brandColor: string | null;
  };
  lineItems: { id: string; description: string; quantity: Num; rate: Num; amount: Num; isMilestone: boolean }[];
};

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 10, color: "#1a1a1a", fontFamily: "Helvetica" },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 28 },
  logo: { maxWidth: 160, maxHeight: 60, marginBottom: 4, objectFit: "contain" },
  orgName: { fontSize: 16, fontWeight: 700, marginBottom: 4 },
  docTitle: { fontSize: 20, fontWeight: 700, textAlign: "right" },
  meta: { fontSize: 10, textAlign: "right", color: "#555", marginTop: 4 },
  label: { fontSize: 8, color: "#888", textTransform: "uppercase", marginBottom: 2 },
  row: { flexDirection: "row", justifyContent: "space-between", marginBottom: 20 },
  title: { fontSize: 14, fontFamily: "Helvetica-Bold", marginBottom: 10 },
  scope: { marginBottom: 18 },
  scopeHeading: { fontFamily: "Helvetica-Bold", marginTop: 6, marginBottom: 3 },
  scopePara: { marginBottom: 6, lineHeight: 1.4 },
  tableHeader: { flexDirection: "row", borderBottomWidth: 1, paddingBottom: 6, marginBottom: 6 },
  tableRow: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: "#ddd", paddingVertical: 6 },
  colDesc: { flex: 4 },
  colQty: { flex: 1, textAlign: "right" },
  colRate: { flex: 1, textAlign: "right" },
  colAmount: { flex: 1, textAlign: "right" },
  headerText: { fontSize: 8, textTransform: "uppercase", color: "#888" },
  milestoneTag: { fontSize: 8, color: "#888" },
  totals: { marginTop: 16, alignItems: "flex-end" },
  totalsRow: { flexDirection: "row", width: 200, justifyContent: "space-between", paddingVertical: 2 },
  grandTotalRow: {
    flexDirection: "row",
    width: 200,
    justifyContent: "space-between",
    paddingTop: 6,
    marginTop: 4,
    borderTopWidth: 1,
  },
  bold: { fontFamily: "Helvetica-Bold" },
  footer: { marginTop: 28, fontSize: 9, color: "#555" },
});

function money(amount: Num, currency: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(Number(amount.toString()));
}

// UTC: date-only columns are stored as UTC midnight.
function day(date: Date) {
  return new Intl.DateTimeFormat("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" }).format(date);
}

export function EstimateDocument({ estimate }: { estimate: EstimateForPdf }) {
  const accent = estimate.org.brandColor || "#1a1a1a";
  const logoSrc = estimate.org.logoData
    ? `data:${estimate.org.logoContentType};base64,${Buffer.from(estimate.org.logoData).toString("base64")}`
    : estimate.org.logoUrl;
  const blocks = estimate.intro ? parseSimpleMarkdown(estimate.intro) : [];

  return (
    <Document title={`Estimate ${estimate.number}`}>
      <Page size="A4" style={styles.page}>
        <View style={styles.headerRow}>
          <View>
            {logoSrc ? (
              // eslint-disable-next-line jsx-a11y/alt-text -- react-pdf's Image has no alt prop
              <Image src={logoSrc} style={styles.logo} />
            ) : (
              <Text style={styles.orgName}>{estimate.org.name}</Text>
            )}
          </View>
          <View>
            <Text style={[styles.docTitle, { color: accent }]}>ESTIMATE</Text>
            <Text style={styles.meta}>{estimate.number}</Text>
          </View>
        </View>

        <View style={styles.row}>
          <View>
            <Text style={styles.label}>Prepared for</Text>
            <Text>{estimate.client.name}</Text>
          </View>
          <View>
            <Text style={styles.label}>Date</Text>
            <Text>{day(estimate.issueDate)}</Text>
            {estimate.expiresAt ? (
              <>
                <View style={{ height: 8 }} />
                <Text style={styles.label}>Valid until</Text>
                <Text>{day(estimate.expiresAt)}</Text>
              </>
            ) : null}
          </View>
        </View>

        <Text style={styles.title}>{estimate.title}</Text>

        {blocks.length ? (
          <View style={styles.scope}>
            {blocks.map((block, i) => {
              if (block.type === "heading") {
                return (
                  <Text key={i} style={styles.scopeHeading}>
                    {inlineText(block.inlines, true)}
                  </Text>
                );
              }
              if (block.type === "list") {
                return (
                  <View key={i} style={{ marginBottom: 6 }}>
                    {block.items.map((item, j) => (
                      <Text key={j} style={{ marginBottom: 2, paddingLeft: 8 }}>
                        {block.ordered ? `${j + 1}.` : "•"} {inlineText(item, true)}
                      </Text>
                    ))}
                  </View>
                );
              }
              return (
                <Text key={i} style={styles.scopePara}>
                  {block.lines.map((l) => inlineText(l, true)).join("\n")}
                </Text>
              );
            })}
          </View>
        ) : null}

        <View>
          <View style={[styles.tableHeader, { borderBottomColor: accent }]}>
            <Text style={[styles.colDesc, styles.headerText]}>Description</Text>
            <Text style={[styles.colQty, styles.headerText]}>Qty</Text>
            <Text style={[styles.colRate, styles.headerText]}>Unit price</Text>
            <Text style={[styles.colAmount, styles.headerText]}>Amount</Text>
          </View>
          {estimate.lineItems.map((item) => (
            <View style={styles.tableRow} key={item.id}>
              <View style={styles.colDesc}>
                <Text>{item.description}</Text>
                {item.isMilestone ? <Text style={styles.milestoneTag}>Milestone</Text> : null}
              </View>
              <Text style={styles.colQty}>{Number(item.quantity.toString())}</Text>
              <Text style={styles.colRate}>{money(item.rate, estimate.currency)}</Text>
              <Text style={styles.colAmount}>{money(item.amount, estimate.currency)}</Text>
            </View>
          ))}
        </View>

        <View style={styles.totals}>
          <View style={styles.totalsRow}>
            <Text style={{ color: "#555" }}>Subtotal</Text>
            <Text>{money(estimate.subtotal, estimate.currency)}</Text>
          </View>
          {Number(estimate.taxRate.toString()) > 0 ? (
            <View style={styles.totalsRow}>
              <Text style={{ color: "#555" }}>Tax ({Number(estimate.taxRate.toString())}%)</Text>
              <Text>{money(estimate.taxAmount, estimate.currency)}</Text>
            </View>
          ) : null}
          <View style={[styles.grandTotalRow, { borderTopColor: accent }]}>
            <Text style={styles.bold}>Total</Text>
            <Text style={[styles.bold, { color: accent }]}>{money(estimate.total, estimate.currency)}</Text>
          </View>
        </View>

        <Text style={styles.footer}>
          {estimate.status === "ACCEPTED"
            ? "This estimate has been accepted."
            : estimate.status === "DECLINED"
              ? "This estimate was declined."
              : estimate.status === "EXPIRED"
                ? "This estimate has expired."
                : "This is an estimate, not an invoice."}
        </Text>
      </Page>
    </Document>
  );
}

export async function renderEstimatePdf(estimate: EstimateForPdf) {
  return renderToBuffer(<EstimateDocument estimate={estimate} />);
}
