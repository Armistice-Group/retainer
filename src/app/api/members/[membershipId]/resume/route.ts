import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOrgContext } from "@/lib/org-context";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ membershipId: string }> }
) {
  const { membershipId } = await params;
  const { org } = await requireOrgContext();

  const membership = await prisma.membership.findUnique({ where: { id: membershipId } });

  if (
    !membership ||
    membership.orgId !== org.id ||
    !membership.resumeFileData ||
    !membership.resumeContentType
  ) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(membership.resumeFileData), {
    headers: {
      "Content-Type": membership.resumeContentType,
      "Content-Disposition": `inline; filename="${membership.resumeFileName ?? "resume"}"`,
    },
  });
}
