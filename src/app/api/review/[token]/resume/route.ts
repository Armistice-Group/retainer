import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const member = await prisma.projectMember.findUnique({
    where: { approvalToken: token },
    include: { project: true },
  });
  if (!member) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const membership = await prisma.membership.findUnique({
    where: { userId_orgId: { userId: member.userId, orgId: member.project.orgId } },
  });

  if (!membership || !membership.resumeFileData || !membership.resumeContentType) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(membership.resumeFileData), {
    headers: {
      "Content-Type": membership.resumeContentType,
      "Content-Disposition": `inline; filename="${membership.resumeFileName ?? "resume"}"`,
    },
  });
}
