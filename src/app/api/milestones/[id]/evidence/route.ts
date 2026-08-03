import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOrgContext } from "@/lib/org-context";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { org } = await requireOrgContext();

  const milestone = await prisma.milestone.findUnique({
    where: { id },
    include: { project: true },
  });

  if (
    !milestone ||
    milestone.project.orgId !== org.id ||
    !milestone.completionFileData ||
    !milestone.completionFileContentType
  ) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(milestone.completionFileData), {
    headers: {
      "Content-Type": milestone.completionFileContentType,
      "Content-Disposition": `inline; filename="${milestone.completionFileName ?? "evidence"}"`,
    },
  });
}
