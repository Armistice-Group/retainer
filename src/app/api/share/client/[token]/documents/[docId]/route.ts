import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sharedUpload } from "@/lib/services/documents";
import { fileResponse } from "@/lib/file-response";

// A document shared with the client, downloaded from a client share link.
export async function GET(_req: Request, { params }: { params: Promise<{ token: string; docId: string }> }) {
  const { token, docId } = await params;
  const client = await prisma.client.findUnique({ where: { shareToken: token } });
  const shared = client ? await sharedUpload({ clientId: client.id }, docId) : null;
  if (!shared) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return fileResponse(shared);
}
