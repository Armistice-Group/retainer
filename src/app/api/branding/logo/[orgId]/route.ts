import { prisma } from "@/lib/prisma";

// Public: the login page shows this before anyone signs in. Only served for
// orgs that turned on in-app branding — otherwise the logo stays private to
// invoices and share pages.
export async function GET(_req: Request, { params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { appBranding: true, logoData: true, logoContentType: true },
  });
  if (!org?.appBranding || !org.logoData || !org.logoContentType) {
    return new Response("Not found", { status: 404 });
  }

  return new Response(new Uint8Array(org.logoData), {
    headers: {
      "Content-Type": org.logoContentType,
      // URLs are versioned (?v=updatedAt), so a cached copy is never stale.
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
      // Uploaded SVGs can carry script; opened directly, this keeps it inert.
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    },
  });
}
