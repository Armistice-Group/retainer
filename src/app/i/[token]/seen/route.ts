import { getInvoiceByViewToken, recordInvoiceView } from "@/lib/services/invoice-delivery";

// Beacon from the invoice page once it's actually rendered in a browser.
// Recording here rather than on the page request keeps link scanners (which
// fetch the page but don't run scripts) from counting as the client.
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invoice = await getInvoiceByViewToken(token);
  if (invoice) await recordInvoiceView(invoice.id, "VIEWED", req);
  return new Response(null, { status: 204 });
}
