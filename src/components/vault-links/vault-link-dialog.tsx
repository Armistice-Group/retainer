"use client";

import { useActionState, useState } from "react";
import { KeyRound, Pencil, Plus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { SubmitButton } from "@/components/forms/submit-button";
import { addVaultLinkAction, updateVaultLinkAction } from "@/actions/vault-links";
import {
  LABEL_MAX,
  NOTE_MAX,
  SECRET_MESSAGE,
  VAULT_ITEM_KINDS,
  VAULT_PROVIDER_LABELS,
  checkVaultUrl,
  looksLikeSecret,
} from "@/lib/vault-links";
import type { ActionState } from "@/actions/auth";

export type EditableVaultLink = {
  id: string;
  label: string;
  note: string | null;
  url: string;
  itemKind: string | null;
  projectId: string | null;
};

/** Add a credential link, or (with `link`) edit one. Owners and admins only. */
export function VaultLinkDialog({
  clientId,
  projectId,
  projects,
  link,
}: {
  clientId: string;
  /** Adding from a project page: fixed to that project. */
  projectId?: string;
  /** On a client page: which project it's for, if any. */
  projects?: { id: string; name: string }[];
  link?: EditableVaultLink;
}) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState(link?.url ?? "");
  const [label, setLabel] = useState(link?.label ?? "");
  const [note, setNote] = useState(link?.note ?? "");
  const checked = url.trim() ? checkVaultUrl(url) : null;
  const secretText = looksLikeSecret(label) || looksLikeSecret(note);
  const idPrefix = link ? `vault-${link.id}` : "vault-new";
  const [state, formAction] = useActionState<ActionState, FormData>(async (prev, formData) => {
    const result = link
      ? await updateVaultLinkAction(link.id, prev, formData)
      : await addVaultLinkAction(clientId, prev, formData);
    if (result?.saved) {
      setOpen(false);
      if (!link) {
        setUrl("");
        setLabel("");
        setNote("");
      }
    }
    return result;
  }, null);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {link ? (
          <Button variant="ghost" size="icon" className="size-7" aria-label={`Edit ${link.label}`}>
            <Pencil className="size-3.5" />
          </Button>
        ) : (
          <Button variant="outline" size="sm">
            <Plus className="size-3.5" /> Add
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{link ? "Edit credential link" : "Link a password-manager item"}</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="flex flex-col gap-4">
          {state?.error ? (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          ) : null}
          {projectId && !link ? <input type="hidden" name="projectId" value={projectId} /> : null}

          <div className="flex flex-col gap-2">
            <Label htmlFor={`${idPrefix}-url`}>Link to the item</Label>
            <Input
              id={`${idPrefix}-url`}
              name="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://start.1password.com/open/i?a=…"
              autoComplete="off"
              spellCheck={false}
              required
            />
            {checked && checked.ok ? (
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <KeyRound className="size-3.5" aria-hidden /> {VAULT_PROVIDER_LABELS[checked.provider]}
              </p>
            ) : checked ? (
              <p className="text-xs text-destructive">{checked.error}</p>
            ) : (
              <p className="text-xs text-muted-foreground">
                In 1Password, open the item and choose <strong>Copy private link</strong>. In
                Bitwarden, open the item in the web vault and copy the address from the browser.
              </p>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor={`${idPrefix}-label`}>Label</Label>
            <Input
              id={`${idPrefix}-label`}
              name="label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Client AWS root"
              maxLength={LABEL_MAX}
              autoComplete="off"
              required
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor={`${idPrefix}-note`}>Note</Label>
            <Textarea
              id={`${idPrefix}-note`}
              name="note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Optional — e.g. Break-glass only; ask Sam for vault access."
              maxLength={NOTE_MAX}
              autoComplete="off"
              rows={2}
            />
            <p className={secretText ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>
              {secretText ? SECRET_MESSAGE : "Don't paste passwords, keys or tokens here. Everyone who can see this client or project can read the note."}
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor={`${idPrefix}-kind`}>Kind</Label>
              <Select name="itemKind" defaultValue={link?.itemKind ?? ""}>
                <SelectTrigger id={`${idPrefix}-kind`} className="w-full">
                  <SelectValue placeholder="Optional" />
                </SelectTrigger>
                <SelectContent>
                  {VAULT_ITEM_KINDS.map((k) => (
                    <SelectItem key={k.value} value={k.value}>
                      {k.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {projects && projects.length ? (
              <div className="flex flex-col gap-2">
                <Label htmlFor={`${idPrefix}-project`}>Project</Label>
                <Select name="projectId" defaultValue={link?.projectId ?? ""}>
                  <SelectTrigger id={`${idPrefix}-project`} className="w-full">
                    <SelectValue placeholder="Whole client" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value=" ">Whole client</SelectItem>
                    {projects.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
          </div>

          <p className="text-xs text-muted-foreground">
            Consultainer keeps only the link, label and note — never the secret. People open the
            item in their own password manager, which decides whether they can see it.
          </p>

          <SubmitButton pendingText="Saving...">{link ? "Save" : "Add link"}</SubmitButton>
        </form>
      </DialogContent>
    </Dialog>
  );
}
