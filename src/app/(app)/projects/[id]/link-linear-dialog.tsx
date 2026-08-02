"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import { Link2 } from "lucide-react";
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
import { linkProjectToLinearTeamAction, listLinearTeamsAction } from "@/actions/linear";
import type { ActionState } from "@/actions/auth";
import type { LinearTeamOption } from "@/lib/integrations/linear";

export function LinkLinearDialog({ projectId }: { projectId: string }) {
  const [open, setOpen] = useState(false);
  const [teams, setTeams] = useState<LinearTeamOption[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string>("");

  const action = linkProjectToLinearTeamAction.bind(null, projectId);
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(action, null);
  const wasPending = useRef(false);

  useEffect(() => {
    if (wasPending.current && !isPending && !state?.error) {
      setOpen(false);
    }
    wasPending.current = isPending;
  }, [isPending, state]);

  useEffect(() => {
    if (!open || teams !== null) return;
    listLinearTeamsAction().then((res) => {
      setTeams(res.teams);
      setLoadError(res.error);
    });
  }, [open, teams]);

  const selectedTeam = teams?.find((t) => t.id === selected);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Link2 className="size-3.5" /> Link Linear team
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Link a Linear team</DialogTitle>
        </DialogHeader>

        {teams === null ? (
          <p className="text-sm text-muted-foreground">Loading teams...</p>
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
            <input type="hidden" name="teamId" value={selected} />
            <input type="hidden" name="teamName" value={selectedTeam?.name ?? ""} />
            <Select value={selected} onValueChange={setSelected}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Choose a team" />
              </SelectTrigger>
              <SelectContent>
                {teams.length === 0 ? (
                  <div className="px-2 py-1.5 text-sm text-muted-foreground">
                    No Linear teams found.
                  </div>
                ) : (
                  teams.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name} ({t.key})
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
            <SubmitButton pendingText="Linking..." disabled={!selected}>
              Link team
            </SubmitButton>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
