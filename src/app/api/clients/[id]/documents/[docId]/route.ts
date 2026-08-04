import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOrgContext } from "@/lib/org-context";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; docId: string }> }
) {
  const { id, docId } = await params;
  const { org } = await requireOrgContext();

  const document = await prisma.clientDocument.findUnique({
    where: { id: docId },
    include: { client: true },
  });

  if (!document || document.clientId !== id || document.client.orgId !== org.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(document.fileData), {
    headers: {
      "Content-Type": document.contentType,
      "Content-Disposition": `inline; filename="${document.fileName}"`,
    },
  });
}
