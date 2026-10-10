import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOrgContext } from "@/lib/org-context";
import { renderCreditNotePdf } from "@/lib/credit-note-pdf";
import { creditNoteVisibilityWhere } from "@/lib/services/payments";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { org, user, role } = await requireOrgContext();

  const note = await prisma.creditNote.findFirst({
    where: { id, orgId: org.id, ...creditNoteVisibilityWhere(user.id, role) },
    include: { client: true, org: true, invoice: { select: { number: true } } },
  });
  if (!note) return NextResponse.json({ error: "Credit note not found" }, { status: 404 });

  const pdf = await renderCreditNotePdf(note);
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${note.number}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
