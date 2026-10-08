import { NextResponse } from "next/server";
import { createInvoicePaymentCheckoutUrl, InvoicePaymentError } from "@/lib/services/invoice-payment";
import { getShareTokenInvoiceIfAuthorized } from "@/lib/services/project-share";
import { getRequestOrigin } from "@/lib/url";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string; invoiceId: string }> }
) {
  const { token, invoiceId } = await params;

  const invoice = await getShareTokenInvoiceIfAuthorized(token, invoiceId);
  if (!invoice) {
    return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  }

  const origin = await getRequestOrigin();
  try {
    const url = await createInvoicePaymentCheckoutUrl(
      invoice,
      `${origin}/share/${token}`
    );
    return NextResponse.redirect(url);
  } catch (err) {
    if (err instanceof InvoicePaymentError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }
}
