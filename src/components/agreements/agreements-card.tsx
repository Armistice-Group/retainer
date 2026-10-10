import Link from "next/link";
import { Download, ExternalLink, FileSignature, Unlink } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmSubmitButton } from "@/components/forms/confirm-submit-button";
import { unlinkAgreementAction } from "@/actions/agreements";
import { formatDate } from "@/lib/format";
import type { AgreementItem } from "@/lib/services/agreements";

export function signerSummary(signers: AgreementItem["signers"]) {
  return signers.map((s) => s.name || s.email).filter(Boolean).join(", ");
}

/** Signed agreements linked to a client (with its projects') or a project.
 * Only rendered with something to show, or for admins once a provider is
 * connected. */
export function AgreementsCard({
  agreements,
  canManage,
  showProject,
}: {
  /** Only the ones the viewer may see. */
  agreements: AgreementItem[];
  /** Owners and admins: unlink, and a pointer to the inbox. */
  canManage: boolean;
  /** On a client page: label each project's agreements. */
  showProject: boolean;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Signed agreements</CardTitle>
        {canManage ? (
          <Button variant="ghost" size="sm" asChild>
            <Link href="/settings/agreements">Inbox</Link>
          </Button>
        ) : null}
      </CardHeader>
      <CardContent>
        {agreements.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No signed agreements linked yet. Link them from the inbox under{" "}
            <strong>Settings → Agreements</strong>, or paste a DocuSign, Documenso or Ironclad
            link under <strong>Documents → Add</strong>.
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {agreements.map((a) => {
              const signers = signerSummary(a.signers);
              return (
                <li key={a.id} className="flex flex-col gap-1.5 py-2.5">
                  <div className="flex min-w-0 items-center gap-2 text-sm">
                    <FileSignature className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                    {a.hasFile ? (
                      <Link href={`/api/agreements/${a.id}`} target="_blank" prefetch={false} className="min-w-0 truncate hover:underline">
                        {a.title}
                      </Link>
                    ) : (
                      <span className="min-w-0 truncate">{a.title}</span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 pl-6">
                    <Badge variant="secondary">{a.providerLabel}</Badge>
                    {showProject && a.projectName ? (
                      <Badge variant="outline" className="font-normal">
                        {a.projectName}
                      </Badge>
                    ) : null}
                    <span className="text-xs text-muted-foreground">
                      {a.signedAt ? `Signed ${formatDate(a.signedAt)}` : "Signed"}
                      {signers ? ` · ${signers}` : ""}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-1 pl-6">
                    {a.externalUrl ? (
                      <Button variant="ghost" size="sm" className="h-7 px-2" asChild>
                        <Link href={`/api/agreements/${a.id}?open=1`} target="_blank" rel="noreferrer" prefetch={false}>
                          <ExternalLink className="size-3.5" /> Open in {a.providerLabel}
                        </Link>
                      </Button>
                    ) : null}
                    {a.hasFile ? (
                      <Button variant="ghost" size="sm" className="h-7 px-2" asChild>
                        <Link href={`/api/agreements/${a.id}?download=1`} prefetch={false}>
                          <Download className="size-3.5" /> Download signed copy
                        </Link>
                      </Button>
                    ) : null}
                    {canManage ? (
                      <form action={unlinkAgreementAction.bind(null, a.id)} className="ml-auto">
                        <ConfirmSubmitButton
                          variant="ghost"
                          size="icon"
                          className="size-7"
                          aria-label={`Unlink ${a.title}`}
                          confirmMessage={`Unlink "${a.title}"? It goes back to the agreements inbox; nothing changes in ${a.providerLabel}.`}
                        >
                          <Unlink className="size-3.5" />
                        </ConfirmSubmitButton>
                      </form>
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
