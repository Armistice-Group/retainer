import { Document, Page, Text, View, Image, StyleSheet, renderToBuffer } from "@react-pdf/renderer";
import type { Prisma } from "@/generated/prisma/client";
import type { DisplayMethod } from "@/lib/payment-methods";
import { effectivePaymentMethods } from "@/lib/services/payment-methods";
import { amountSettled, balanceDue } from "@/lib/invoice-balance";
import { formatClockRange } from "@/lib/clock-time";
import { invoiceTimeDetail, type TimeDetailEntry } from "@/lib/services/invoice-time-detail";
import { clientLogoDataUri } from "@/lib/services/client-logos";

export type InvoiceForPdf = Prisma.InvoiceGetPayload<{
  include: {
    client: true;
    org: true;
    lineItems: { include: { timeEntries: { select: { id: true } } } };
  };
}>;

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 10, color: "#1a1a1a", fontFamily: "Helvetica" },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 32,
  },
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
  totalsRow: {
    flexDirection: "row",
    width: 200,
    justifyContent: "space-between",
    paddingVertical: 2,
  },
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
  clientLogo: { maxWidth: 80, maxHeight: 32, marginBottom: 4, objectFit: "contain", objectPositionX: 0 },
  detailTitle: { fontSize: 14, fontWeight: 700, marginBottom: 4 },
  detailMeta: { fontSize: 9, color: "#555", marginBottom: 12 },
  detailRow: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: "#ddd",
    paddingVertical: 4,
    fontSize: 9,
  },
  dColDate: { width: 72 },
  dColTime: { width: 70 },
  dColHours: { width: 36, textAlign: "right", paddingRight: 8 },
  dColPerson: { width: 80 },
  dColDesc: { flex: 1 },
  dayTotal: { fontSize: 8, color: "#888" },
});

function formatCurrency(amount: number | string | { toString(): string }, currency: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(
    Number(amount.toString()),
  );
}

// timeZone: "UTC" — issueDate/dueDate are date-only columns stored as
// UTC midnight; formatting in the server's local zone can roll the
// printed date back a day on any server west of UTC.
function formatDate(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(date);
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

export function InvoiceDocument({
  invoice,
  paymentMethods,
  timeDetail = null,
  clientLogo = null,
}: {
  invoice: InvoiceForPdf;
  paymentMethods: DisplayMethod[];
  /** Entries for the time detail page (the client opted in). */
  timeDetail?: TimeDetailEntry[] | null;
  /** PNG/JPEG data: URI of the client's logo. */
  clientLogo?: string | null;
}) {
  const accentColor = invoice.org.brandColor || "#1a1a1a";
  const billEmail = invoice.client.billingEmail || invoice.client.email;
  const billAddress = invoice.client.billingAddress || invoice.client.address;
  // Methods marked share-page-only (bank details, by default) never go on
  // the PDF, which can be forwarded anywhere.
  const pdfMethods = paymentMethods.filter((m) => m.showOnPdf);
  const hiddenCount = paymentMethods.length - pdfMethods.length;
  const settled = amountSettled(invoice);
  // Says plainly when this isn't a live bill: a draft, paid, or void.
  const statusMark =
    invoice.status === "DRAFT"
      ? { label: "DRAFT — NOT SENT", color: "#888888" }
      : invoice.status === "PAID"
        ? { label: "PAID", color: "#15803d" }
        : invoice.status === "VOID"
          ? { label: "VOID", color: "#b91c1c" }
          : null;
  const showHowToPay = invoice.status === "SENT" || invoice.status === "DRAFT";
  const logoSrc = invoice.org.logoData
    ? `data:${invoice.org.logoContentType};base64,${Buffer.from(invoice.org.logoData).toString("base64")}`
    : invoice.org.logoUrl;

  return (
    <Document title={`Invoice ${invoice.number}`}>
      <Page size="A4" style={styles.page}>
        <View style={styles.headerRow}>
          <View>
            {logoSrc ? (
              <>
                {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf's Image has no alt prop */}
                <Image src={logoSrc} style={styles.logo} />
                <Text style={{ fontSize: 9, color: "#555" }}>{invoice.org.name}</Text>
              </>
            ) : (
              <Text style={styles.orgName}>{invoice.org.name}</Text>
            )}
            {invoice.org.businessAddress ? (
              <Text style={{ fontSize: 9, color: "#555", marginTop: 2 }}>{invoice.org.businessAddress}</Text>
            ) : null}
            {invoice.org.taxId ? (
              <Text style={{ fontSize: 9, color: "#555", marginTop: 2 }}>Tax ID {invoice.org.taxId}</Text>
            ) : null}
          </View>
          <View>
            <Text style={[styles.invoiceTitle, { color: accentColor }]}>
              {invoice.kind === "DEPOSIT" ? "DEPOSIT INVOICE" : "INVOICE"}
            </Text>
            <Text style={styles.invoiceMeta}>{invoice.number}</Text>
            {invoice.poNumber ? (
              <Text style={styles.invoiceMeta}>PO {invoice.poNumber.replace(/^PO[\s#:-]*/i, "")}</Text>
            ) : null}
            {statusMark ? (
              <Text style={[styles.invoiceMeta, { color: statusMark.color, fontWeight: 700, marginTop: 6 }]}>
                {statusMark.label}
              </Text>
            ) : null}
          </View>
        </View>

        <View style={styles.billToRow}>
          <View>
            <Text style={styles.label}>Bill To</Text>
            {clientLogo ? (
              // eslint-disable-next-line jsx-a11y/alt-text -- react-pdf's Image has no alt prop
              <Image src={clientLogo} style={styles.clientLogo} />
            ) : null}
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
          {invoice.lineItems.map((item) => {
            const isHourly = item.timeEntries.length > 0;
            return (
              <View style={styles.tableRow} key={item.id}>
                <Text style={styles.colDesc}>{item.description}</Text>
                <Text style={styles.colQty}>
                  {Number(item.quantity)}
                  {isHourly ? " hrs" : ""}
                </Text>
                <Text style={styles.colRate}>
                  {formatCurrency(item.rate, invoice.currency)}
                  {isHourly ? "/hr" : ""}
                </Text>
                <Text style={styles.colAmount}>
                  {formatCurrency(item.amount, invoice.currency)}
                </Text>
              </View>
            );
          })}
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
            <Text style={[styles.grandTotalValue, settled > 0 ? {} : { color: accentColor }]}>
              {formatCurrency(invoice.total, invoice.currency)}
            </Text>
          </View>
          {/* Part payments and credit come off, leaving the amount due. */}
          {Number(invoice.amountPaid) > 0 ? (
            <View style={styles.totalsRow}>
              <Text style={styles.totalsLabel}>Paid</Text>
              <Text>−{formatCurrency(invoice.amountPaid, invoice.currency)}</Text>
            </View>
          ) : null}
          {Number(invoice.creditApplied) > 0 ? (
            <View style={styles.totalsRow}>
              <Text style={styles.totalsLabel}>Credit applied</Text>
              <Text>−{formatCurrency(invoice.creditApplied, invoice.currency)}</Text>
            </View>
          ) : null}
          {settled > 0 ? (
            <View style={[styles.grandTotalRow, { borderTopColor: accentColor }]}>
              <Text style={styles.grandTotalLabel}>Amount due</Text>
              <Text style={[styles.grandTotalValue, { color: accentColor }]}>
                {formatCurrency(invoice.status === "VOID" ? 0 : balanceDue(invoice), invoice.currency)}
              </Text>
            </View>
          ) : null}
        </View>

        {showHowToPay && (pdfMethods.length || hiddenCount) ? (
          <View style={styles.notes}>
            <Text style={styles.label}>How to Pay</Text>
            {pdfMethods.map((m) => (
              <View key={m.id} style={{ marginBottom: 6 }}>
                <Text style={{ fontFamily: "Helvetica-Bold" }}>{m.title}</Text>
                {m.lines.map((line, i) => (
                  <Text key={i}>{line.label ? `${line.label}: ${line.value}` : line.value}</Text>
                ))}
              </View>
            ))}
            {hiddenCount ? (
              <Text style={{ color: "#666666" }}>
                {pdfMethods.length ? "Bank transfer details" : "Payment details"} are on your secure
                client link from {invoice.org.name}.
              </Text>
            ) : null}
          </View>
        ) : null}

        {invoice.notes ? (
          <View style={styles.notes}>
            <Text style={styles.label}>Notes</Text>
            <Text>{invoice.notes}</Text>
          </View>
        ) : null}
      </Page>
      {timeDetail?.length ? (
        <TimeDetailPage invoice={invoice} entries={timeDetail} accentColor={accentColor} />
      ) : null}
    </Document>
  );
}

/** Every entry billed on the invoice: when it was worked, for how long. */
function TimeDetailPage({
  invoice,
  entries,
  accentColor,
}: {
  invoice: InvoiceForPdf;
  entries: TimeDetailEntry[];
  accentColor: string;
}) {
  const people = new Set(entries.map((e) => e.person));
  const projects = new Set(entries.map((e) => e.project));
  const total = entries.reduce((sum, e) => sum + e.hours, 0);
  const evidenceCount = entries.reduce((sum, e) => sum + e.evidence.length, 0);
  return (
    <Page size="A4" style={styles.page}>
      <Text style={styles.detailTitle}>Time detail</Text>
      <Text style={styles.detailMeta}>
        Invoice {invoice.number} · {entries.length} {entries.length === 1 ? "entry" : "entries"} ·{" "}
        {Number(total.toFixed(2))} hrs
      </Text>
      <View style={[styles.tableHeader, { borderBottomColor: accentColor }]} fixed>
        <Text style={[styles.dColDate, styles.headerText]}>Date</Text>
        <Text style={[styles.dColTime, styles.headerText]}>Time</Text>
        <Text style={[styles.dColHours, styles.headerText]}>Hrs</Text>
        {people.size > 1 ? <Text style={[styles.dColPerson, styles.headerText]}>Who</Text> : null}
        <Text style={[styles.dColDesc, styles.headerText]}>Work</Text>
      </View>
      {entries.map((e) => {
        const what = [
          projects.size > 1 ? e.project : null,
          e.task,
          e.description,
        ].filter(Boolean).join(" · ");
        return (
          <View style={styles.detailRow} key={e.id} wrap={false}>
            <Text style={styles.dColDate}>{formatShortDate(e.date)}</Text>
            <Text style={styles.dColTime}>
              {e.startMinute != null && e.endMinute != null ? formatClockRange(e.startMinute, e.endMinute) : "—"}
            </Text>
            <Text style={styles.dColHours}>{Number(e.hours.toFixed(2))}</Text>
            {people.size > 1 ? <Text style={styles.dColPerson}>{e.person}</Text> : null}
            <Text style={styles.dColDesc}>
              {what || "—"}
              {e.evidence.length
                ? ` (${e.evidence.length} attachment${e.evidence.length === 1 ? "" : "s"})`
                : ""}
            </Text>
          </View>
        );
      })}
      {evidenceCount ? (
        <Text style={styles.notes}>
          Attachments can be opened from the online copy of this invoice (the link in its email).
        </Text>
      ) : null}
    </Page>
  );
}

function formatShortDate(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

export async function renderInvoicePdf(invoice: InvoiceForPdf) {
  const [paymentMethods, timeDetail, clientLogo] = await Promise.all([
    effectivePaymentMethods(invoice.orgId, invoice.clientId),
    invoiceTimeDetail(invoice),
    invoice.client.logoUpdatedAt ? clientLogoDataUri(invoice.clientId, { pdf: true }) : null,
  ]);
  return renderToBuffer(
    <InvoiceDocument
      invoice={invoice}
      paymentMethods={paymentMethods}
      timeDetail={timeDetail}
      clientLogo={clientLogo}
    />
  );
}
