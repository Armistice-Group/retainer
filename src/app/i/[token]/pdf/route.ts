import { NextResponse } from "next/server";
import { renderInvoicePdf } from "@/lib/invoice-pdf";
import { getInvoiceByViewToken, recordInvoiceView } from "@/lib/services/invoice-delivery";

// The invoice PDF behind a client link. ?embed=1 is the copy shown inside
// the invoice page (that page records its own view); ?download=1 saves it.
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invoice = await getInvoiceByViewToken(token);
  if (!invoice) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });

  const url = new URL(req.url);
  if (!url.searchParams.has("embed")) await recordInvoiceView(invoice.id, "PDF_VIEWED", req);

  const pdf = await renderInvoicePdf(invoice);
  const disposition = url.searchParams.has("download") ? "attachment" : "inline";
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${disposition}; filename="${invoice.number}.pdf"`,
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}
