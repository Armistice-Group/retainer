import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ConfirmSubmitButton } from "@/components/forms/confirm-submit-button";
import { AddDocumentDialog } from "./add-document-dialog";
import { deleteClientDocumentAction } from "@/actions/client-documents";
import { formatDate } from "@/lib/format";
import { FileText, Trash2 } from "lucide-react";

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
};

export function ClientDocumentsCard({
  clientId,
  documents,
}: {
  clientId: string;
  documents: ClientDocumentItem[];
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Documents</CardTitle>
        <AddDocumentDialog clientId={clientId} />
      </CardHeader>
      <CardContent>
        {documents.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No documents on file. Attach a W-9, 1099, contract, or other paperwork.
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {documents.map((doc) => (
              <li key={doc.id} className="flex items-center justify-between gap-2 py-2.5">
                <a
                  href={`/api/clients/${clientId}/documents/${doc.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex min-w-0 items-center gap-2 text-sm hover:underline"
                >
                  <FileText className="size-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate">
                    {doc.label || doc.fileName}
                  </span>
                </a>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge variant="secondary">{TYPE_LABELS[doc.type] ?? doc.type}</Badge>
                  <span className="text-xs text-muted-foreground">{formatDate(doc.uploadedAt)}</span>
                  <form action={deleteClientDocumentAction.bind(null, doc.id, clientId)}>
                    <ConfirmSubmitButton
                      variant="ghost"
                      size="icon"
                      className="size-7"
                      confirmMessage={`Delete "${doc.label || doc.fileName}"?`}
                    >
                      <Trash2 className="size-3.5" />
                    </ConfirmSubmitButton>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
