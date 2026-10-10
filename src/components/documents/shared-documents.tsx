import { ExternalLink, FileText } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DocumentIcon, SOURCE_LABELS } from "./provider-icon";
import { DOCUMENT_TYPE_LABELS } from "./document-types";
import { formatDate } from "@/lib/format";

/** Documents shared with the client, on a share page. Uploads download
 * through `uploadHref`; links open where they live. */
export function SharedDocuments({
  documents,
  uploadHref,
}: {
  documents: {
    id: string;
    type: string;
    label: string | null;
    fileName: string;
    source: string;
    externalKind: string | null;
    externalUrl: string | null;
    uploadedAt: Date;
    project: { name: string } | null;
  }[];
  uploadHref: (id: string) => string;
}) {
  if (documents.length === 0) return null;
  return (
    <Card>
      <CardHeader className="flex flex-row items-center gap-2">
        <FileText className="size-4 text-muted-foreground" />
        <CardTitle className="text-base">Documents</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col divide-y divide-border p-0">
        {documents.map((d) => {
          const href = d.source === "UPLOAD" ? uploadHref(d.id) : d.externalUrl;
          if (!href) return null;
          return (
            <a
              key={d.id}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 px-6 py-3 text-sm hover:bg-muted/50"
            >
              <DocumentIcon source={d.source} kind={d.externalKind} className="size-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{d.label || d.fileName}</p>
                <p className="text-xs text-muted-foreground">
                  {DOCUMENT_TYPE_LABELS[d.type] ?? d.type}
                  {d.project ? ` · ${d.project.name}` : ""} · {SOURCE_LABELS[d.source]} · {formatDate(d.uploadedAt)}
                </p>
              </div>
              <ExternalLink className="size-3.5 shrink-0 text-muted-foreground" />
            </a>
          );
        })}
      </CardContent>
    </Card>
  );
}
