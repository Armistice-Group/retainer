"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import { GitBranch } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SubmitButton } from "@/components/forms/submit-button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { connectRepoAction, listGithubReposAction } from "@/actions/code-health";
import type { ActionState } from "@/actions/auth";
import type { GithubRepoOption } from "@/lib/integrations/github";

export function ConnectRepoDialog({ projectId }: { projectId: string }) {
  const [open, setOpen] = useState(false);
  const [repos, setRepos] = useState<GithubRepoOption[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string>("");

  const action = connectRepoAction.bind(null, projectId);
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(action, null);
  const wasPending = useRef(false);

  useEffect(() => {
    if (wasPending.current && !isPending && !state?.error) {
      setOpen(false);
    }
    wasPending.current = isPending;
  }, [isPending, state]);

  useEffect(() => {
    if (!open || repos !== null) return;
    listGithubReposAction().then((res) => {
      setRepos(res.repos);
      setLoadError(res.error);
    });
  }, [open, repos]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <GitBranch className="size-3.5" /> Connect a repo
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Connect a GitHub repo</DialogTitle>
        </DialogHeader>

        {repos === null ? (
          <p className="text-sm text-muted-foreground">Loading repos...</p>
        ) : loadError ? (
          <Alert>
            <AlertDescription className="flex flex-col items-start gap-2">
              {loadError}
              <Button size="sm" asChild>
                <Link href="/settings">Go to Settings</Link>
              </Button>
            </AlertDescription>
          </Alert>
        ) : (
          <form action={formAction} className="flex flex-col gap-4">
            {state?.error ? (
              <Alert variant="destructive">
                <AlertDescription>{state.error}</AlertDescription>
              </Alert>
            ) : null}
            <input type="hidden" name="repo" value={selected} />
            <Select value={selected} onValueChange={setSelected}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Choose a repo" />
              </SelectTrigger>
              <SelectContent>
                {repos.length === 0 ? (
                  <div className="px-2 py-1.5 text-sm text-muted-foreground">
                    No accessible repos found.
                  </div>
                ) : (
                  repos.map((r) => (
                    <SelectItem key={r.fullName} value={r.fullName}>
                      {r.fullName}
                      {r.private ? " (private)" : ""}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
            <SubmitButton pendingText="Connecting..." disabled={!selected}>
              Connect
            </SubmitButton>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
