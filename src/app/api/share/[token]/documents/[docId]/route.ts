import { NextResponse } from "next/server";
import { authorizeShareRequest } from "@/lib/share-gate";
import { prisma } from "@/lib/prisma";
import { sharedUpload } from "@/lib/services/documents";
import { fileResponse } from "@/lib/file-response";

// A document shared with the client, downloaded from a project share link.
export async function GET(_req: Request, { params }: { params: Promise<{ token: string; docId: string }> }) {
  const { token, docId } = await params;
  // Same gate as the share page (expiry, email verification).
  if (!(await authorizeShareRequest("project", token))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const project = await prisma.project.findUnique({ where: { shareToken: token } });
  const shared = project ? await sharedUpload({ clientId: project.clientId, projectId: project.id }, docId) : null;
  if (!shared) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return fileResponse(shared);
}
