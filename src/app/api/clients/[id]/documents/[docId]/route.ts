import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOrgContext } from "@/lib/org-context";
import { canViewDocument } from "@/lib/document-access";
import { recordAuditEvent } from "@/lib/audit";

// The file itself: inline by default (the in-app viewer embeds it),
// ?download=1 to save. Restricted documents 404 for anyone not allowed, and
// every open lands in the audit log.
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string; docId: string }> }
) {
  const { id, docId } = await params;
  const { org, user, role } = await requireOrgContext();

  const document = await prisma.clientDocument.findUnique({
    where: { id: docId },
    include: { client: true },
  });

  if (
    !document ||
    document.clientId !== id ||
    document.client.orgId !== org.id ||
    !canViewDocument(document, user.id, role)
  ) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const download = new URL(req.url).searchParams.has("download");
  await recordAuditEvent(prisma, {
    orgIds: [org.id],
    actorId: user.id,
    action: download ? "download" : "view",
    entityType: "ClientDocument",
    entityId: document.id,
    entityLabel: document.label || document.fileName,
  });

  const fileName = document.fileName.replace(/["\r\n]/g, "");
  return new NextResponse(new Uint8Array(document.fileData), {
    headers: {
      "Content-Type": document.contentType,
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${fileName}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
