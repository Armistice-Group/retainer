"use client";

import Link from "next/link";
import { useActionState, useState, useTransition } from "react";
import { Merge, UserCheck, FileSignature, Trash2, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { SubmitButton } from "@/components/forms/submit-button";
import { discardDraftAction, mergeDraftAction, promoteDraftAction, restoreDraftAction } from "@/actions/scheduling";
import type { ActionState } from "@/actions/auth";

/** On a draft client's page: where it came from, and (owners and admins)
 * what to do with it. */
export function DraftBanner({
  clientId,
  clientName,
  source,
  bookedAt,
  discardedAt,
  purgeAt,
  canManage,
  mergeTargets,
}: {
  clientId: string;
  clientName: string;
  source: string | null;
  bookedAt: string | null;
  discardedAt: string | null;
  purgeAt: string | null;
  canManage: boolean;
  mergeTargets: { id: string; name: string }[];
}) {
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<ActionState>, done: string) =>
    start(async () => {
      const r = await fn();
      if (r?.error) toast.error(r.error);
      else toast.success(done);
    });
  const booked = bookedAt
    ? new Date(bookedAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })
    : null;

  return (
    <Alert className="mb-4">
      <AlertDescription className="flex flex-col gap-3">
        <span>
          {discardedAt ? (
            <>
              <strong>Discarded draft client.</strong> It&apos;s deleted on{" "}
              {purgeAt ? new Date(purgeAt).toLocaleDateString("en-US", { dateStyle: "medium" }) : "its purge date"}{" "}
              unless you restore it.
            </>
          ) : (
            <>
              <strong>Draft client</strong>
              {source ? ` from ${source}` : ""}
              {booked ? `, booked ${booked}` : ""}. It isn&apos;t a client yet: no projects, invoices or share link
              until {canManage ? "you make it one" : "an owner or admin makes it one"}.
            </>
          )}
        </span>
        {canManage ? (
          <div className="flex flex-wrap items-center gap-2">
            {discardedAt ? (
              <Button
                size="sm"
                disabled={pending}
                onClick={() => run(() => restoreDraftAction(clientId), "Restored to Drafts.")}
              >
                <Undo2 className="size-3.5" /> Restore
              </Button>
            ) : (
              <>
                <Button
                  size="sm"
                  disabled={pending}
                  onClick={() => run(() => promoteDraftAction(clientId), `${clientName} is now a client.`)}
                >
                  <UserCheck className="size-3.5" /> Make client
                </Button>
                <Button size="sm" variant="outline" asChild>
                  <Link href={`/estimates/new?clientId=${clientId}`}>
                    <FileSignature className="size-3.5" /> Create estimate
                  </Link>
                </Button>
                <MergeDialog clientId={clientId} clientName={clientName} targets={mergeTargets} />
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={pending}
                  onClick={() => {
                    if (
                      window.confirm(
                        `Discard ${clientName}? It leaves Drafts and is deleted after 30 days unless you restore it.`
                      )
                    ) {
                      run(() => discardDraftAction(clientId), "Discarded.");
                    }
                  }}
                >
                  <Trash2 className="size-3.5" /> Discard
                </Button>
              </>
            )}
          </div>
        ) : null}
      </AlertDescription>
    </Alert>
  );
}

function MergeDialog({
  clientId,
  clientName,
  targets,
}: {
  clientId: string;
  clientName: string;
  targets: { id: string; name: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState<ActionState, FormData>(mergeDraftAction.bind(null, clientId), null);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Merge className="size-3.5" /> Merge into…
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Merge {clientName} into a client</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="flex flex-col gap-4">
          {state?.error ? (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          ) : null}
          <p className="text-sm text-muted-foreground">
            Its contacts, bookings, links, documents, estimates and agreements move to the client you pick (contacts it
            already has aren&apos;t copied twice). Then this draft is deleted.
          </p>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="merge-target">Client</Label>
            <select
              id="merge-target"
              name="targetId"
              required
              defaultValue=""
              className="h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs"
            >
              <option value="" disabled>
                Choose a client…
              </option>
              {targets.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <SubmitButton size="sm" pendingText="Merging...">
              Merge
            </SubmitButton>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
