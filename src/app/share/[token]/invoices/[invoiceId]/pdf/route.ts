import { NextResponse } from "next/server";
import { renderInvoicePdf } from "@/lib/invoice-pdf";
import { getShareTokenInvoiceIfAuthorized } from "@/lib/services/project-share";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string; invoiceId: string }> }
) {
  const { token, invoiceId } = await params;

  const invoice = await getShareTokenInvoiceIfAuthorized(token, invoiceId);
  if (!invoice) {
    return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  }

  const pdfBuffer = await renderInvoicePdf(invoice);

  return new NextResponse(new Uint8Array(pdfBuffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${invoice.number}.pdf"`,
    },
  });
}
