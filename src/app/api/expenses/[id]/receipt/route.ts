import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOrgContext } from "@/lib/org-context";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { org } = await requireOrgContext();

  const expense = await prisma.expense.findUnique({ where: { id } });

  if (
    !expense ||
    expense.orgId !== org.id ||
    !expense.receiptFileData ||
    !expense.receiptContentType
  ) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(expense.receiptFileData), {
    headers: {
      "Content-Type": expense.receiptContentType,
      "Content-Disposition": `inline; filename="${expense.receiptFileName ?? "receipt"}"`,
    },
  });
}
