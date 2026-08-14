import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOrgContext } from "@/lib/org-context";
import { renderInvoicePdf } from "@/lib/invoice-pdf";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { org } = await requireOrgContext();

  const invoice = await prisma.invoice.findUnique({
    where: { id },
    include: {
      client: true,
      org: true,
      lineItems: {
        orderBy: { sortOrder: "asc" },
        include: { timeEntries: { select: { id: true } } },
      },
    },
  });

  if (!invoice || invoice.orgId !== org.id) {
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
