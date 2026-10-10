import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOrgContext } from "@/lib/org-context";
import { canViewProject } from "@/lib/project-access";
import { readFile } from "@/lib/file-storage";
import { fileResponse } from "@/lib/file-response";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { org, user, role } = await requireOrgContext();

  const milestone = await prisma.milestone.findUnique({ where: { id }, include: { project: true } });
  if (!milestone || milestone.project.orgId !== org.id || !(await canViewProject(milestone.project, user.id, role))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const bytes = await readFile({
    fileData: milestone.completionFileData,
    storageKey: milestone.completionStorageKey,
  });
  if (!bytes) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return fileResponse({
    doc: { fileName: milestone.completionFileName ?? "evidence", contentType: milestone.completionFileContentType },
    bytes,
  });
}
