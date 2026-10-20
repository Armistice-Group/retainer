import { NextResponse } from "next/server";
import { getInvoiceByViewToken } from "@/lib/services/invoice-delivery";
import { readAttachmentForInvoice } from "@/lib/services/time-entry-attachments";
import { fileResponse } from "@/lib/file-response";

// Evidence marked for the client, opened from the invoice's time detail.
export async function GET(_req: Request, { params }: { params: Promise<{ token: string; id: string }> }) {
  const { token, id } = await params;
  const invoice = await getInvoiceByViewToken(token);
  const file = invoice && invoice.status !== "DRAFT" ? await readAttachmentForInvoice(invoice, id) : null;
  if (!file) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return fileResponse(file);
}
