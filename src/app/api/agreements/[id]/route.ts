import { NextResponse } from "next/server";
import { requireOrgContext } from "@/lib/org-context";
import { readFile } from "@/lib/file-storage";
import { agreementFileFor, auditAgreementOpen } from "@/lib/services/agreements";

// A signed agreement's cached PDF (inline; ?download=1 to save), or — with
// ?open=1, or when nothing is cached — a redirect to it in the provider.
// Same visibility as the client/project page shows; every open is audited.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { org, user, role } = await requireOrgContext();
  const viewer = { orgId: org.id, userId: user.id, role };
  const agreement = await agreementFileFor(viewer, id);
  if (!agreement) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const search = new URL(req.url).searchParams;
  const download = search.has("download");
  if (search.has("open") || agreement.sizeBytes === null) {
    if (!agreement.externalUrl) return NextResponse.json({ error: "Not found" }, { status: 404 });
    await auditAgreementOpen(viewer, agreement, "view");
    return NextResponse.redirect(agreement.externalUrl);
  }
  const bytes = await readFile(agreement);
  if (!bytes) return NextResponse.json({ error: "File missing" }, { status: 404 });
  await auditAgreementOpen(viewer, agreement, download ? "download" : "view");
  const fileName = (agreement.fileName ?? `${agreement.title}.pdf`).replace(/["\r\n]/g, "");
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${fileName}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "X-Robots-Tag": "noindex",
    },
  });
}
