import { NextResponse } from "next/server";
import { authorizeShareRequest } from "@/lib/share-gate";
import { renderInvoicePdf } from "@/lib/invoice-pdf";
import { recordInvoiceView } from "@/lib/services/invoice-delivery";
import { getClientShareTokenInvoiceIfAuthorized } from "@/lib/services/client-share";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ token: string; invoiceId: string }> }
) {
  const { token, invoiceId } = await params;
  // Same gate as the share page: expired links and unverified visitors
  // (when email verification is on) get nothing.
  if (!(await authorizeShareRequest("client", token))) {
    return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  }

  const invoice = await getClientShareTokenInvoiceIfAuthorized(token, invoiceId);
  if (!invoice) {
    return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  }

  await recordInvoiceView(invoice.id, "PDF_VIEWED", req);

  const pdfBuffer = await renderInvoicePdf(invoice);

  return new NextResponse(new Uint8Array(pdfBuffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${invoice.number}.pdf"`,
    },
  });
}
