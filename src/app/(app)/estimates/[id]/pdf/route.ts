import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOrgContext } from "@/lib/org-context";
import { renderEstimatePdf } from "@/lib/estimate-pdf";
import { estimateVisibilityWhere } from "@/lib/services/estimates";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { org, user, role } = await requireOrgContext();

  const estimate = await prisma.estimate.findFirst({
    where: { id, orgId: org.id, ...estimateVisibilityWhere(user.id, role) },
    include: {
      client: { select: { name: true } },
      org: {
        select: { name: true, logoData: true, logoUrl: true, logoContentType: true, brandColor: true },
      },
      lineItems: { orderBy: { sortOrder: "asc" } },
    },
  });
  if (!estimate) return NextResponse.json({ error: "Estimate not found" }, { status: 404 });

  const pdf = await renderEstimatePdf(estimate);
  const disposition = new URL(req.url).searchParams.has("download") ? "attachment" : "inline";
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${disposition}; filename="${estimate.number}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
