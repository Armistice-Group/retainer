"use client";

import { useState } from "react";
import { Loader2, RefreshCw, ListTodo, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { EmptyState } from "@/components/empty-state";
import { LinkLinearDialog } from "./link-linear-dialog";
import { unlinkLinearProjectAction, syncLinearTasksAction } from "@/actions/linear";

export function LinearSyncCard({
  projectId,
  externalName,
  canManage,
}: {
  projectId: string;
  externalName: string | null;
  canManage: boolean;
}) {
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [lastSynced, setLastSynced] = useState<number | null>(null);
  const [unlinking, setUnlinking] = useState(false);

  async function sync() {
    setSyncing(true);
    setSyncError(null);
    try {
      const res = await syncLinearTasksAction(projectId);
      if (res.error) setSyncError(res.error);
      else setLastSynced(res.synced);
    } finally {
      setSyncing(false);
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
        {externalName ? (
          <Button variant="outline" size="sm" onClick={sync} disabled={syncing}>
            {syncing ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
            Sync now
          </Button>
        ) : null}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {!externalName ? (
          <EmptyState
            icon={ListTodo}
            title="No Linear team linked"
            description="Link a Linear team to pull its issues in as tasks."
            action={canManage ? <LinkLinearDialog projectId={projectId} /> : undefined}
          />
        ) : (
          <div className="flex items-center justify-between gap-2">
            <div className="text-sm">
              <p className="font-medium">{externalName}</p>
              {lastSynced !== null ? (
                <p className="text-muted-foreground">
                  Synced {lastSynced} issue{lastSynced === 1 ? "" : "s"}.
                </p>
              ) : (
                <p className="text-muted-foreground">Not synced yet this session.</p>
              )}
            </div>
            {canManage ? (
              <Button
                variant="ghost"
                size="icon"
                className="size-7 shrink-0"
                onClick={unlink}
                disabled={unlinking}
              >
                <Trash2 className="size-3.5" />
              </Button>
            ) : null}
          </div>
        )}

        {syncError ? (
          <Alert variant="destructive">
            <AlertDescription>{syncError}</AlertDescription>
          </Alert>
        ) : null}
      </CardContent>
    </Card>
  );
}
