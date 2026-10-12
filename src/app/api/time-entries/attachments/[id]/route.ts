import { NextResponse } from "next/server";
import { requireOrgContext } from "@/lib/org-context";
import { readAttachmentForMember } from "@/lib/services/time-entry-attachments";
import { fileResponse } from "@/lib/file-response";

// A time entry's evidence, for anyone in the org who can see its project.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { org, user, role } = await requireOrgContext();
  const file = await readAttachmentForMember({ orgId: org.id, actorId: user.id, role }, id);
  if (!file) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return fileResponse(file);
}
