"use client";

import { useState } from "react";
import Link from "next/link";
import { Loader2, RefreshCw, ListTodo, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { EmptyState } from "@/components/empty-state";
import { LinkLinearDialog } from "./link-linear-dialog";
import {
  unlinkLinearProjectAction,
  syncLinearTasksAction,
  removeStaleLinearTasksAction,
} from "@/actions/linear";
import { formatDate } from "@/lib/format";

export type LinearLinkSummary = {
  teamId: string;
  teamName: string | null;
  linearProjectId: string | null;
  linearProjectName: string | null;
  labelIds: string[];
  labelNames: string[];
  pushChanges: boolean;
  lastSyncedAt: string | null;
};

export function LinearSyncCard({
  projectId,
  link,
  canManage,
  connectionCanWrite,
}: {
  projectId: string;
  link: LinearLinkSummary | null;
  canManage: boolean;
  /** False for connections granted before write access was requested. */
  connectionCanWrite: boolean;
}) {
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [unlinking, setUnlinking] = useState(false);
  const [stale, setStale] = useState(0);
  const [removing, setRemoving] = useState(false);

  async function sync() {
    setSyncing(true);
    setSyncError(null);
    try {
      const res = await syncLinearTasksAction(projectId);
      if (res.error || !res.result) {
        setSyncError(res.error);
      } else {
        const { created, updated, skipped, comments, pushed, pushFailed, pushError } = res.result;
        setStale(res.result.stale);
        setResult(
          `${created} new, ${updated} updated` +
            (skipped ? `, ${skipped} skipped (already in another project)` : "") +
            (comments ? `, ${comments} comment${comments === 1 ? "" : "s"} pulled in` : "") +
            (pushed ? `, ${pushed} sent to Linear` : "") +
            ".",
        );
        if (pushFailed) {
          setSyncError(
            `Couldn't send ${pushFailed} task${pushFailed === 1 ? "" : "s"} to Linear` +
              (pushError ? `: ${pushError}` : "."),
          );
        }
      }
    } finally {
      setSyncing(false);
    }
  }

  async function removeStale() {
    if (
      !confirm(
        `Remove ${stale} task${stale === 1 ? "" : "s"} that no longer match? Tasks with time logged are kept. Nothing changes in Linear.`,
      )
    )
      return;
    setRemoving(true);
    setSyncError(null);
    try {
      const res = await removeStaleLinearTasksAction(projectId);
      if (res.error) {
        setSyncError(res.error);
      } else {
        setStale(0);
        setResult(
          `Removed ${res.removed} task${res.removed === 1 ? "" : "s"}.` +
            (res.keptWithTime
              ? ` Kept ${res.keptWithTime} with time logged — delete those individually if you need to.`
              : ""),
        );
      }
    } finally {
      setRemoving(false);
    }
  }

  async function unlink() {
    setUnlinking(true);
    try {
      await unlinkLinearProjectAction(projectId);
    } finally {
      setUnlinking(false);
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Linear</CardTitle>
        {link ? (
          <Button variant="outline" size="sm" onClick={sync} disabled={syncing}>
            {syncing ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <RefreshCw className="size-3.5" />
            )}
            Sync now
          </Button>
        ) : null}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {!link ? (
          <EmptyState
            icon={ListTodo}
            title="Not linked to Linear"
            description="Pull in issues from a Linear team — narrowed to one Linear project or labels — as tasks."
            action={canManage ? <LinkLinearDialog projectId={projectId} /> : undefined}
          />
        ) : (
          <div className="flex items-start justify-between gap-2">
            <div className="flex min-w-0 flex-col gap-1.5 text-sm">
              <p className="font-medium">
                {link.teamName ?? "Linear team"}
                {link.linearProjectName ? ` · ${link.linearProjectName}` : ""}
              </p>
              {link.labelNames.length ? (
                <div className="flex flex-wrap gap-1">
                  {link.labelNames.map((name) => (
                    <Badge key={name} variant="outline" className="font-normal">
                      {name}
                    </Badge>
                  ))}
                </div>
              ) : null}
              <p className="text-muted-foreground">
                {result ??
                  (link.lastSyncedAt
                    ? `Last synced ${formatDate(link.lastSyncedAt)}.`
                    : "Not synced yet.")}
                {link.pushChanges && connectionCanWrite ? " Task changes are sent to Linear." : ""}
              </p>
            </div>
            {canManage ? (
              <div className="flex shrink-0 items-center">
                <LinkLinearDialog
                  projectId={projectId}
                  existing={{
                    teamId: link.teamId,
                    linearProjectId: link.linearProjectId,
                    labelIds: link.labelIds,
                    pushChanges: link.pushChanges,
                  }}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  onClick={unlink}
                  disabled={unlinking}
                  aria-label="Unlink from Linear"
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            ) : null}
          </div>
        )}

        {stale > 0 && canManage ? (
          <div className="flex items-center justify-between gap-3 rounded-lg border border-border p-3 text-sm">
            <span className="text-muted-foreground">
              {stale} task{stale === 1 ? "" : "s"} pulled in earlier no longer match
              {stale === 1 ? "es" : ""} these filters.
            </span>
            <Button variant="outline" size="sm" onClick={removeStale} disabled={removing}>
              {removing ? <Loader2 className="size-3.5 animate-spin" /> : null}
              Remove
            </Button>
          </div>
        ) : null}

        {link?.pushChanges && !connectionCanWrite ? (
          <Alert>
            <AlertDescription>
              Linear was connected with read-only access, so changes here aren&apos;t sent back yet.{" "}
              <Link href="/settings/integrations" className="text-brand hover:underline">
                Reconnect Linear
              </Link>{" "}
              to allow it.
            </AlertDescription>
          </Alert>
        ) : null}

        {syncError ? (
          <Alert variant="destructive">
            <AlertDescription>{syncError}</AlertDescription>
          </Alert>
        ) : null}
      </CardContent>
    </Card>
  );
}
