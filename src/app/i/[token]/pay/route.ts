import { NextResponse } from "next/server";
import { createInvoicePaymentCheckoutUrl, InvoicePaymentError } from "@/lib/services/invoice-payment";
import { getInvoiceByViewToken } from "@/lib/services/invoice-delivery";
import { getRequestOrigin } from "@/lib/url";

// Opened from the client's browser, so failures go back to the invoice page
// with a reason it explains (?paid=error&reason=…), not a JSON body.
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const origin = await getRequestOrigin();
  const invoiceUrl = `${origin}/i/${encodeURIComponent(token)}`;
  const invoice = await getInvoiceByViewToken(token);
  // The invoice page shows its own not-found.
  if (!invoice) return NextResponse.redirect(invoiceUrl, 303);

  try {
    return NextResponse.redirect(await createInvoicePaymentCheckoutUrl(invoice, `${origin}/i/${token}`), 303);
  } catch (err) {
    const reason = err instanceof InvoicePaymentError ? err.reason : "unavailable";
    if (!(err instanceof InvoicePaymentError)) console.error("[pay] Couldn't start checkout", invoice.id, err);
    return NextResponse.redirect(`${invoiceUrl}?paid=error&reason=${reason}`, 303);
  }
}
