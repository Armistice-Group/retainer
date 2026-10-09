import Link from "next/link";
import { FileText, Lock, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ConfirmSubmitButton } from "@/components/forms/confirm-submit-button";
import { AddDocumentDialog } from "./add-document-dialog";
import { DocumentAccessDialog } from "./document-access-dialog";
import type { DocumentMember } from "./document-access-fields";
import { deleteClientDocumentAction } from "@/actions/client-documents";
import { DOCUMENT_ACCESS_LABELS } from "@/lib/document-access";
import { formatDate } from "@/lib/format";
import type { DocumentAccess } from "@/generated/prisma/client";

const TYPE_LABELS: Record<string, string> = {
  W9: "W-9",
  FORM_1099: "1099",
  CONTRACT: "Contract",
  OTHER: "Other",
};

export type ClientDocumentItem = {
  id: string;
  type: string;
  label: string | null;
  fileName: string;
  uploadedAt: string;
  access: DocumentAccess;
  allowedUserIds: string[];
  canManage: boolean;
};

export function ClientDocumentsCard({
  clientId,
  documents,
  members,
  viewerId,
}: {
  clientId: string;
  /** Only the ones the viewer may see. */
  documents: ClientDocumentItem[];
  members: DocumentMember[];
  viewerId: string;
}) {
  const names = new Map(members.map((m) => [m.id, m.name]));
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Documents</CardTitle>
        <AddDocumentDialog clientId={clientId} members={members} viewerId={viewerId} />
      </CardHeader>
      <CardContent>
        {documents.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No documents on file. Attach a W-9, 1099, contract, or other paperwork.
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {documents.map((doc) => (
              <li key={doc.id} className="flex flex-col gap-1.5 py-2.5">
                <Link
                  href={`/clients/${clientId}/documents/${doc.id}`}
                  className="flex min-w-0 items-center gap-2 text-sm hover:underline"
                >
                  <FileText className="size-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 truncate">{doc.label || doc.fileName}</span>
                </Link>
                <div className="flex flex-wrap items-center gap-2 pl-6">
                  {doc.access !== "EVERYONE" ? (
                    <Badge
                      variant="outline"
                      className="gap-1 font-normal"
                      title={
                        doc.access === "SELECTED"
                          ? doc.allowedUserIds.map((id) => names.get(id) ?? "Former member").join(", ")
                          : undefined
                      }
                    >
                      <Lock className="size-3" />
                      {doc.access === "SELECTED"
                        ? `${doc.allowedUserIds.length} ${doc.allowedUserIds.length === 1 ? "person" : "people"}`
                        : DOCUMENT_ACCESS_LABELS[doc.access]}
                    </Badge>
                  ) : null}
                  <Badge variant="secondary">{TYPE_LABELS[doc.type] ?? doc.type}</Badge>
                  <span className="text-xs text-muted-foreground">{formatDate(doc.uploadedAt)}</span>
                  {doc.canManage ? (
                    <div className="ml-auto flex items-center">
                      <DocumentAccessDialog
                        clientId={clientId}
                        document={doc}
                        members={members}
                        viewerId={viewerId}
                      />
                      <form action={deleteClientDocumentAction.bind(null, doc.id, clientId)}>
                        <ConfirmSubmitButton
                          variant="ghost"
                          size="icon"
                          className="size-7"
                          aria-label="Delete document"
                          confirmMessage={`Delete "${doc.label || doc.fileName}"?`}
                        >
                          <Trash2 className="size-3.5" />
                        </ConfirmSubmitButton>
                      </form>
                    </div>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
