import { NextResponse } from "next/server";

/** Serves a stored file inline, safely (no sniffing, no caching, no indexing). */
export function fileResponse({ doc, bytes }: { doc: { fileName: string; contentType: string | null }; bytes: Uint8Array }) {
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": doc.contentType ?? "application/octet-stream",
      "Content-Disposition": `inline; filename="${doc.fileName.replace(/["\r\n]/g, "")}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "X-Robots-Tag": "noindex",
    },
  });
}
