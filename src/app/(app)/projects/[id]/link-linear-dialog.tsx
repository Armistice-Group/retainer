"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { Link2, Pencil } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SubmitButton } from "@/components/forms/submit-button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  linkProjectToLinearAction,
  listLinearTeamsAction,
  listLinearTeamFiltersAction,
} from "@/actions/linear";
import type { ActionState } from "@/actions/auth";
import type {
  LinearTeamOption,
  LinearProjectOption,
  LinearLabelOption,
} from "@/lib/integrations/linear";

export type LinearLinkValues = {
  teamId: string;
  linearProjectId: string | null;
  labelIds: string[];
  pushChanges: boolean;
};

const ANY_PROJECT = "__any__";

/** Link a project to a Linear team, optionally narrowed to one Linear
 * project and/or labels — so several clients can share one team. */
export function LinkLinearDialog({
  projectId,
  existing,
}: {
  projectId: string;
  existing?: LinearLinkValues;
}) {
  const [open, setOpen] = useState(false);
  // Remount the form on each open so it starts from the saved link.
  const [formKey, setFormKey] = useState(0);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setFormKey((k) => k + 1);
      }}
    >
      <DialogTrigger asChild>
        {existing ? (
          <Button variant="ghost" size="sm">
            <Pencil className="size-3.5" /> Edit
          </Button>
        ) : (
          <Button variant="outline" size="sm">
            <Link2 className="size-3.5" /> Link Linear
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{existing ? "Linear sync settings" : "Link to Linear"}</DialogTitle>
        </DialogHeader>
        <LinkForm
          key={formKey}
          projectId={projectId}
          existing={existing}
          onDone={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function LinkForm({
  projectId,
  existing,
  onDone,
}: {
  projectId: string;
  existing?: LinearLinkValues;
  onDone: () => void;
}) {
  const [teams, setTeams] = useState<LinearTeamOption[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [teamId, setTeamId] = useState(existing?.teamId ?? "");
  const [filters, setFilters] = useState<{
    teamId: string;
    projects: LinearProjectOption[];
    labels: LinearLabelOption[];
    error: string | null;
  } | null>(null);
  const [linearProjectId, setLinearProjectId] = useState(existing?.linearProjectId ?? ANY_PROJECT);
  const [labelIds, setLabelIds] = useState<string[]>(existing?.labelIds ?? []);

  const [state, formAction] = useActionState<ActionState, FormData>(
    linkProjectToLinearAction.bind(null, projectId),
    null,
  );

  useEffect(() => {
    if (state?.saved) onDone();
  }, [state, onDone]);

  useEffect(() => {
    listLinearTeamsAction().then((res) => {
      setTeams(res.teams);
      setLoadError(res.error);
    });
  }, []);

  useEffect(() => {
    if (!teamId) return;
    let cancelled = false;
    listLinearTeamFiltersAction(teamId).then((res) => {
      if (!cancelled) setFilters({ teamId, ...res });
    });
    return () => {
      cancelled = true;
    };
  }, [teamId]);

  if (teams === null) return <p className="text-sm text-muted-foreground">Loading teams...</p>;
  if (loadError) {
    return (
      <Alert>
        <AlertDescription className="flex flex-col items-start gap-2">
          {loadError}
          <Button size="sm" asChild>
            <Link href="/settings/integrations">Go to Settings</Link>
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  const team = teams.find((t) => t.id === teamId);
  const loaded = filters?.teamId === teamId ? filters : null;
  const chosenProject = loaded?.projects.find((p) => p.id === linearProjectId);

  return (
    <form action={formAction} className="flex flex-col gap-5">
      {state?.error ? (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}
      <input type="hidden" name="teamId" value={teamId} />
      <input type="hidden" name="teamName" value={team?.name ?? ""} />
      <input
        type="hidden"
        name="linearProjectId"
        value={linearProjectId === ANY_PROJECT ? "" : linearProjectId}
      />
      <input type="hidden" name="linearProjectName" value={chosenProject?.name ?? ""} />
      {labelIds.map((id) => (
        <span key={id}>
          <input type="hidden" name="labelIds" value={id} />
          <input
            type="hidden"
            name="labelNames"
            value={loaded?.labels.find((l) => l.id === id)?.name ?? id}
          />
        </span>
      ))}

      <div className="flex flex-col gap-1.5">
        <Label>Team</Label>
        <Select
          value={teamId}
          onValueChange={(v) => {
            setTeamId(v);
            setLinearProjectId(ANY_PROJECT);
            setLabelIds([]);
          }}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Choose a team" />
          </SelectTrigger>
          <SelectContent>
            {teams.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.name} ({t.key})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {teamId ? (
        loaded === null ? (
          <p className="text-sm text-muted-foreground">Loading projects and labels...</p>
        ) : loaded.error ? (
          <p className="text-sm text-destructive">{loaded.error}</p>
        ) : (
          <>
            <div className="flex flex-col gap-1.5">
              <Label>Linear project</Label>
              <Select value={linearProjectId} onValueChange={setLinearProjectId}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ANY_PROJECT}>Any project</SelectItem>
                  {loaded.projects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>Labels</Label>
              <p className="text-xs text-muted-foreground">
                Only issues with at least one of these. Leave all unchecked to not filter by label.
              </p>
              {loaded.labels.length === 0 ? (
                <p className="text-sm text-muted-foreground">This team has no labels.</p>
              ) : (
                <div className="grid max-h-48 grid-cols-2 gap-x-4 gap-y-2 overflow-y-auto rounded-md border border-border p-3">
                  {loaded.labels.map((l) => (
                    <label key={l.id} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={labelIds.includes(l.id)}
                        onCheckedChange={(checked) =>
                          setLabelIds((ids) =>
                            checked ? [...ids, l.id] : ids.filter((id) => id !== l.id),
                          )
                        }
                      />
                      <span
                        className="size-2 shrink-0 rounded-full"
                        style={{ background: l.color }}
                      />
                      <span className="truncate">{l.name}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>

            <div className="flex items-start gap-2">
              <Checkbox
                id="pushChanges"
                name="pushChanges"
                defaultChecked={existing?.pushChanges ?? true}
                className="mt-0.5"
              />
              <Label htmlFor="pushChanges" className="flex-col items-start gap-0.5 font-normal">
                Send task changes to Linear
                <span className="text-xs text-muted-foreground">
                  New tasks here become Linear issues
                  {linearProjectId !== ANY_PROJECT || labelIds.length
                    ? " with this project and these labels"
                    : ""}
                  ; title, status, and assignee edits sync back. Syncing also sends open
                  tasks that don&apos;t have an issue yet.
                </span>
              </Label>
            </div>
          </>
        )
      ) : null}

      <SubmitButton pendingText="Saving..." disabled={!teamId || !loaded || !!loaded.error}>
        {existing ? "Save" : "Link"}
      </SubmitButton>
    </form>
  );
}
