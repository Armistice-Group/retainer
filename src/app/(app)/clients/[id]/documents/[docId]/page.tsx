import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Download, Lock } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireOrgContext } from "@/lib/org-context";
import { canViewDocument, DOCUMENT_ACCESS_LABELS } from "@/lib/document-access";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { formatDate } from "@/lib/format";

export default async function DocumentViewerPage({
  params,
}: {
  params: Promise<{ id: string; docId: string }>;
}) {
  const { id, docId } = await params;
  const { org, user, role } = await requireOrgContext();

  const doc = await prisma.clientDocument.findUnique({
    where: { id: docId },
    select: {
      id: true,
      clientId: true,
      label: true,
      fileName: true,
      contentType: true,
      uploadedAt: true,
      uploadedById: true,
      access: true,
      allowedUserIds: true,
      uploadedBy: { select: { name: true } },
      client: { select: { orgId: true, name: true } },
    },
  });
  if (
    !doc ||
    doc.clientId !== id ||
    doc.client.orgId !== org.id ||
    !canViewDocument(doc, user.id, role)
  ) {
    notFound();
  }

  const src = `/api/clients/${id}/documents/${docId}`;
  const isPdf = doc.contentType === "application/pdf";

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={doc.label || doc.fileName}
        description={`${doc.client.name} · Uploaded ${formatDate(doc.uploadedAt)}${doc.uploadedBy ? ` by ${doc.uploadedBy.name}` : ""}`}
        actions={
          <>
            <Button variant="ghost" size="sm" asChild>
              <Link href={`/clients/${id}`}>
                <ArrowLeft /> Back
              </Link>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <a href={`${src}?download=1`}>
                <Download /> Download
              </a>
            </Button>
          </>
        }
      />
      {doc.access !== "EVERYONE" ? (
        <Badge variant="outline" className="gap-1 self-start font-normal">
          <Lock className="size-3" /> {DOCUMENT_ACCESS_LABELS[doc.access]}
        </Badge>
      ) : null}
      <Card className="overflow-hidden p-0">
        {isPdf ? (
          <iframe src={src} title={doc.fileName} className="h-[80vh] min-h-[480px] w-full bg-muted" />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element -- private file behind auth
          <img src={src} alt={doc.label || doc.fileName} className="mx-auto max-h-[80vh] object-contain" />
        )}
      </Card>
    </div>
  );
}
