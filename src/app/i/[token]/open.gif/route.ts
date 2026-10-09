import { getInvoiceByViewToken, recordInvoiceView } from "@/lib/services/invoice-delivery";

// 1×1 transparent GIF in invoice emails: loading it means the email was
// opened (as far as the mail client lets us know — some block images, and
// some privacy proxies load them for everyone).
const PIXEL = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");

export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invoice = await getInvoiceByViewToken(token);
  if (invoice) await recordInvoiceView(invoice.id, "EMAIL_OPENED", req);
  return new Response(new Uint8Array(PIXEL), {
    headers: {
      "Content-Type": "image/gif",
      "Cache-Control": "no-store, no-cache, must-revalidate, private",
    },
  });
}
