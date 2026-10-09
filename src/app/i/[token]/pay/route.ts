import { NextResponse } from "next/server";
import { createInvoicePaymentCheckoutUrl, InvoicePaymentError } from "@/lib/services/invoice-payment";
import { getInvoiceByViewToken } from "@/lib/services/invoice-delivery";
import { getRequestOrigin } from "@/lib/url";

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invoice = await getInvoiceByViewToken(token);
  if (!invoice) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });

  const origin = await getRequestOrigin();
  try {
    return NextResponse.redirect(await createInvoicePaymentCheckoutUrl(invoice, `${origin}/i/${token}`));
  } catch (err) {
    if (err instanceof InvoicePaymentError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }
}
