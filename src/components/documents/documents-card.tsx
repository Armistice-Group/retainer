import Link from "next/link";
import { ExternalLink, Lock, RefreshCw, Trash2, Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmSubmitButton } from "@/components/forms/confirm-submit-button";
import { AddDocumentDialog } from "./add-document-dialog";
import { DocumentSharingDialog } from "./document-sharing-dialog";
import { DocumentIcon, SOURCE_LABELS } from "./provider-icon";
import { DOCUMENT_TYPE_LABELS } from "./document-types";
import type { DocumentMember } from "./document-access-fields";
import { deleteClientDocumentAction, refreshLinkedDocumentAction } from "@/actions/client-documents";
import { DOCUMENT_ACCESS_LABELS } from "@/lib/document-access";
import { formatDate } from "@/lib/format";
import type { DocumentAccess } from "@/generated/prisma/client";

export type DocumentItem = {
  id: string;
  title: string;
  type: string;
  source: string;
  kind: string | null;
  audience: string;
  access: DocumentAccess;
  allowedUserIds: string[];
  /** Upload date, or the linked item's last-modified date when known. */
  date: string;
  modified: boolean;
  projectName: string | null;
  canManage: boolean;
};

/** A client's or project's documents — uploads and links to where they
 * live — with who can see each. */
export function DocumentsCard({
  clientId,
  projectId,
  projects,
  documents,
  members,
  viewerId,
  uploadLimitMb,
  connectedProviders,
}: {
  clientId: string;
  projectId?: string;
  projects?: { id: string; name: string }[];
  /** Only the ones the viewer may see. */
  documents: DocumentItem[];
  members: DocumentMember[];
  viewerId: string;
  uploadLimitMb: number;
  /** Providers the viewer has connected, for browsing. */
  connectedProviders: string[];
}) {
  const names = new Map(members.map((m) => [m.id, m.name]));
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Documents</CardTitle>
        <AddDocumentDialog
          clientId={clientId}
          projectId={projectId}
          projects={projects}
          members={members}
          viewerId={viewerId}
          uploadLimitMb={uploadLimitMb}
          providers={connectedProviders}
        />
      </CardHeader>
      <CardContent>
        {documents.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Link contracts, SOWs and reference docs from Google Drive, Dropbox, OneDrive or
            Notion, or upload them here.
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {documents.map((doc) => {
              const href =
                doc.source === "UPLOAD"
                  ? `/clients/${clientId}/documents/${doc.id}`
                  : `/api/clients/${clientId}/documents/${doc.id}`;
              return (
                <li key={doc.id} className="flex flex-col gap-1.5 py-2.5">
                  <Link
                    href={href}
                    target={doc.source === "UPLOAD" ? undefined : "_blank"}
                    rel={doc.source === "UPLOAD" ? undefined : "noreferrer"}
                    prefetch={false}
                    className="flex min-w-0 items-center gap-2 text-sm hover:underline"
                  >
                    <DocumentIcon source={doc.source} kind={doc.kind} className="size-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 truncate">{doc.title}</span>
                    {doc.source !== "UPLOAD" ? <ExternalLink className="size-3 shrink-0 text-muted-foreground" /> : null}
                  </Link>
                  <div className="flex flex-wrap items-center gap-1.5 pl-6">
                    {doc.audience === "CLIENT" ? (
                      <Badge variant="outline" className="gap-1 font-normal">
                        <Users className="size-3" /> Client can see
                      </Badge>
                    ) : null}
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
                    <Badge variant="secondary">{DOCUMENT_TYPE_LABELS[doc.type] ?? doc.type}</Badge>
                    {doc.projectName ? (
                      <Badge variant="outline" className="font-normal">
                        {doc.projectName}
                      </Badge>
                    ) : null}
                    <span className="text-xs text-muted-foreground">
                      {SOURCE_LABELS[doc.source]} · {doc.modified ? "edited " : ""}
                      {formatDate(doc.date)}
                    </span>
                    {doc.canManage ? (
                      <div className="ml-auto flex items-center">
                        {doc.source !== "UPLOAD" && doc.source !== "LINK" ? (
                          <form action={refreshLinkedDocumentAction.bind(null, doc.id, clientId)}>
                            <Button variant="ghost" size="icon" className="size-7" type="submit" aria-label={`Refresh ${doc.title}`}>
                              <RefreshCw className="size-3.5" />
                            </Button>
                          </form>
                        ) : null}
                        <DocumentSharingDialog
                          clientId={clientId}
                          document={{
                            id: doc.id,
                            title: doc.title,
                            access: doc.access,
                            allowedUserIds: doc.allowedUserIds,
                            audience: doc.audience,
                          }}
                          members={members}
                          viewerId={viewerId}
                        />
                        <form action={deleteClientDocumentAction.bind(null, doc.id, clientId)}>
                          <ConfirmSubmitButton
                            variant="ghost"
                            size="icon"
                            className="size-7"
                            aria-label={`Remove ${doc.title}`}
                            confirmMessage={
                              doc.source === "UPLOAD"
                                ? `Delete "${doc.title}"?`
                                : `Remove the link to "${doc.title}"? The file itself isn't touched.`
                            }
                          >
                            <Trash2 className="size-3.5" />
                          </ConfirmSubmitButton>
                        </form>
                      </div>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
