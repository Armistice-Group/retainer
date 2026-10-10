import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOrgContext } from "@/lib/org-context";
import { canViewProject } from "@/lib/project-access";
import { readFile } from "@/lib/file-storage";
import { fileResponse } from "@/lib/file-response";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { org, user, role } = await requireOrgContext();

  const expense = await prisma.expense.findUnique({ where: { id }, include: { project: true } });
  // Same visibility as the project: a confidential project's receipts are
  // need-to-know too.
  if (!expense || expense.orgId !== org.id || !(await canViewProject(expense.project, user.id, role))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const bytes = await readFile({ fileData: expense.receiptFileData, storageKey: expense.receiptStorageKey });
  if (!bytes) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return fileResponse({
    doc: { fileName: expense.receiptFileName ?? "receipt", contentType: expense.receiptContentType },
    bytes,
  });
}
