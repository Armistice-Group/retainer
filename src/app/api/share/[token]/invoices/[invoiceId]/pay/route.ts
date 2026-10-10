import { NextResponse } from "next/server";
import { authorizeShareRequest } from "@/lib/share-gate";
import { createInvoicePaymentCheckoutUrl, InvoicePaymentError } from "@/lib/services/invoice-payment";
import { getShareTokenInvoiceIfAuthorized } from "@/lib/services/project-share";
import { getRequestOrigin } from "@/lib/url";

// Opened from the client's browser, so failures go back to the share page
// with a reason it explains (?paid=error&reason=…), not a JSON body.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string; invoiceId: string }> }
) {
  const { token, invoiceId } = await params;
  const origin = await getRequestOrigin();
  const pageUrl = `${origin}/share/${encodeURIComponent(token)}`;

  // Not verified (or expired): back to the page, which shows the gate.
  if (!(await authorizeShareRequest("project", token))) return NextResponse.redirect(pageUrl, 303);

  const invoice = await getShareTokenInvoiceIfAuthorized(token, invoiceId);
  // The share page shows its own not-found, or the invoice list without it.
  if (!invoice) return NextResponse.redirect(pageUrl, 303);

  const back = `${pageUrl}?invoice=${encodeURIComponent(invoice.id)}`;
  try {
    return NextResponse.redirect(await createInvoicePaymentCheckoutUrl(invoice, back), 303);
  } catch (err) {
    const reason = err instanceof InvoicePaymentError ? err.reason : "unavailable";
    if (!(err instanceof InvoicePaymentError)) console.error("[pay] Couldn't start checkout", invoice.id, err);
    return NextResponse.redirect(`${back}&paid=error&reason=${reason}`, 303);
  }
}
