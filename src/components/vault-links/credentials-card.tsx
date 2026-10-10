import { ExternalLink, KeyRound, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmSubmitButton } from "@/components/forms/confirm-submit-button";
import { deleteVaultLinkAction } from "@/actions/vault-links";
import { VaultLinkDialog } from "./vault-link-dialog";
import type { VaultLinkItem } from "@/lib/services/vault-links";

/** Links to password-manager items for a client (with its projects') or a
 * project. Never the secrets themselves — each opens in the vault. */
export function CredentialsCard({
  clientId,
  projectId,
  projects,
  links,
  canManage,
}: {
  clientId: string;
  /** On a project page: new links go on this project. */
  projectId?: string;
  /** On a client page: projects to pick from (and label links with). */
  projects?: { id: string; name: string }[];
  /** Only the ones the viewer may see. */
  links: VaultLinkItem[];
  /** Owners and admins: add, edit, remove. */
  canManage: boolean;
}) {
  if (!canManage && links.length === 0) return null;
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Credentials</CardTitle>
        {canManage ? <VaultLinkDialog clientId={clientId} projectId={projectId} projects={projects} /> : null}
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <p className="text-xs text-muted-foreground">
          Opens in your password manager. You&apos;ll only see items you have access to there.
        </p>
        {links.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No credentials linked yet. Click <strong>Add</strong> and paste the link to an item in
            1Password, Bitwarden or another password manager.
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-border" data-testid="vault-links">
            {links.map((l) => (
              <li key={l.id} className="flex flex-col gap-1.5 py-2.5">
                <div className="flex min-w-0 items-center gap-2 text-sm">
                  <KeyRound className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="min-w-0 truncate font-medium">{l.label}</span>
                </div>
                <div className="flex flex-wrap items-center gap-1.5 pl-6">
                  <Badge variant="secondary">{l.providerLabel}</Badge>
                  {l.itemKindLabel ? (
                    <Badge variant="outline" className="font-normal">
                      {l.itemKindLabel}
                    </Badge>
                  ) : null}
                  {projectId ? (
                    l.projectId ? null : (
                      <Badge variant="outline" className="font-normal">
                        Whole client
                      </Badge>
                    )
                  ) : l.projectName ? (
                    <Badge variant="outline" className="font-normal">
                      {l.projectName}
                    </Badge>
                  ) : null}
                </div>
                {l.note ? (
                  <p className="whitespace-pre-line pl-6 text-xs text-muted-foreground">{l.note}</p>
                ) : null}
                <div className="flex flex-wrap items-center gap-1 pl-6">
                  <Button variant="ghost" size="sm" className="h-7 px-2" asChild>
                    <a href={l.url} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="size-3.5" /> {l.openLabel}
                    </a>
                  </Button>
                  {canManage ? (
                    <div className="ml-auto flex items-center">
                      <VaultLinkDialog
                        clientId={clientId}
                        projects={projectId ? undefined : projects}
                        link={{
                          id: l.id,
                          label: l.label,
                          note: l.note,
                          url: l.url,
                          itemKind: l.itemKind,
                          projectId: l.projectId,
                        }}
                      />
                      <form action={deleteVaultLinkAction.bind(null, l.id)}>
                        <ConfirmSubmitButton
                          variant="ghost"
                          size="icon"
                          className="size-7"
                          aria-label={`Remove ${l.label}`}
                          confirmMessage={`Remove the link to "${l.label}"? Nothing changes in ${l.providerLabel === "Other vault" ? "your vault" : l.providerLabel}.`}
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
