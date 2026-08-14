import { NextResponse } from "next/server";
import { createInvoicePaymentCheckoutUrl, InvoicePaymentError } from "@/lib/services/invoice-payment";
import { getClientShareTokenInvoiceIfAuthorized } from "@/lib/services/client-share";
import { getOrigin } from "@/lib/url";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string; invoiceId: string }> }
) {
  const { token, invoiceId } = await params;

  const invoice = await getClientShareTokenInvoiceIfAuthorized(token, invoiceId);
  if (!invoice) {
    return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  }

  const origin = await getOrigin();
  try {
    const url = await createInvoicePaymentCheckoutUrl(
      invoice,
      `${origin}/share/client/${token}`
    );
    return NextResponse.redirect(url);
  } catch (err) {
    if (err instanceof InvoicePaymentError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }
}
