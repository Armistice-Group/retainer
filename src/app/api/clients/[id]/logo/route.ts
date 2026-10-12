import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOrgContext } from "@/lib/org-context";

// A client's logo, for people signed in to the client's org.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { org } = await requireOrgContext();
  const logo = await prisma.clientLogo.findFirst({ where: { clientId: id, client: { orgId: org.id } } });
  if (!logo) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return new Response(new Uint8Array(logo.data), {
    headers: {
      "Content-Type": logo.contentType,
      // URLs are versioned (?v=logoUpdatedAt), so a cached copy is never stale.
      "Cache-Control": "private, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
      // SVGs can carry script; opened directly, this keeps it inert.
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    },
  });
}
