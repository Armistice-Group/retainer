import { NextResponse } from "next/server";
import { renderEstimatePdf } from "@/lib/estimate-pdf";
import { getEstimateByViewToken } from "@/lib/services/estimates";

// The estimate PDF behind a client link. ?download=1 saves it.
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const estimate = await getEstimateByViewToken(token);
  if (!estimate) return NextResponse.json({ error: "Estimate not found" }, { status: 404 });

  const pdf = await renderEstimatePdf(estimate);
  const disposition = new URL(req.url).searchParams.has("download") ? "attachment" : "inline";
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${disposition}; filename="${estimate.number}.pdf"`,
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}
