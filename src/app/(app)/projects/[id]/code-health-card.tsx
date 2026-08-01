"use client";

import { useState } from "react";
import { Loader2, RefreshCw, ShieldAlert, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { EmptyState } from "@/components/empty-state";
import { cn } from "@/lib/utils";
import { ConnectRepoDialog } from "./connect-repo-dialog";
import { disconnectRepoAction, setCodeHealthGateAction } from "@/actions/code-health";
import type { Finding, FindingSeverity } from "@/lib/codeHealth/checks";

const SEVERITY_STYLES: Record<FindingSeverity, string> = {
  critical: "bg-destructive/10 text-destructive border-destructive/30",
  high: "bg-chart-4/15 text-chart-4 border-chart-4/30",
  medium: "bg-muted text-muted-foreground border-border",
};

function scoreBadgeClass(score: number) {
  if (score >= 80) return "bg-chart-3/15 text-chart-3 border-chart-3/30";
  if (score >= 50) return "bg-chart-4/15 text-chart-4 border-chart-4/30";
  return "bg-destructive/10 text-destructive border-destructive/30";
}

export type CodeHealthRepo = { githubOwner: string; githubName: string };
export type CodeHealthScan = { score: number; findings: Finding[]; createdAt: string };

export function CodeHealthCard({
  projectId,
  repo,
  latestScan,
  gateEnabled,
  canManage,
}: {
  projectId: string;
  repo: CodeHealthRepo | null;
  latestScan: CodeHealthScan | null;
  gateEnabled: boolean;
  canManage: boolean;
}) {
  const [scan, setScan] = useState(latestScan);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [showFindings, setShowFindings] = useState(false);
  const [gate, setGate] = useState(gateEnabled);
  const [disconnecting, setDisconnecting] = useState(false);

  async function rescan() {
    setScanning(true);
    setScanError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/scan`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setScanError(data.error ?? "Scan failed.");
      } else {
        setScan({ score: data.score, findings: data.findings, createdAt: new Date().toISOString() });
        setShowFindings(data.findings.length > 0);
      }
    } catch {
      setScanError("Scan failed. Check your connection and try again.");
    } finally {
      setScanning(false);
    }
  }

  async function disconnect() {
    setDisconnecting(true);
    try {
      await disconnectRepoAction(projectId);
    } finally {
      setDisconnecting(false);
    }
  }

  async function toggleGate(checked: boolean) {
    setGate(checked);
    await setCodeHealthGateAction(projectId, checked);
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">AI Code Health</CardTitle>
        {repo ? (
          <Button variant="outline" size="sm" onClick={rescan} disabled={scanning}>
            {scanning ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <RefreshCw className="size-3.5" />
            )}
            Re-scan
          </Button>
        ) : null}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {!repo ? (
          <EmptyState
            icon={ShieldAlert}
            title="No repo connected"
            description="Connect a GitHub repo to scan it for the security issues AI-generated code tends to have."
            action={<ConnectRepoDialog projectId={projectId} />}
          />
        ) : (
          <>
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm">
                <p className="font-medium">
                  {repo.githubOwner}/{repo.githubName}
                </p>
                {scan ? (
                  <p className="text-muted-foreground">
                    Last scanned {new Date(scan.createdAt).toLocaleString()}
                  </p>
                ) : (
                  <p className="text-muted-foreground">Not scanned yet.</p>
                )}
              </div>
              {canManage ? (
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7 shrink-0"
                  onClick={disconnect}
                  disabled={disconnecting}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              ) : null}
            </div>

            {scanError ? (
              <Alert variant="destructive">
                <AlertDescription>{scanError}</AlertDescription>
              </Alert>
            ) : null}

            {scan ? (
              <>
                <div className="flex items-center gap-3">
                  <Badge variant="outline" className={cn("h-6 px-2.5 text-sm font-semibold", scoreBadgeClass(scan.score))}>
                    {scan.score}/100
                  </Badge>
                  <button
                    type="button"
                    className="text-sm text-primary hover:underline disabled:pointer-events-none disabled:opacity-50"
                    onClick={() => setShowFindings((v) => !v)}
                    disabled={scan.findings.length === 0}
                  >
                    {scan.findings.length === 0
                      ? "No findings"
                      : `${showFindings ? "Hide" : "Show"} ${scan.findings.length} finding${scan.findings.length === 1 ? "" : "s"}`}
                  </button>
                </div>

                {showFindings && scan.findings.length > 0 ? (
                  <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
                    {scan.findings.map((f, i) => (
                      <li key={`${f.id}-${i}`} className="p-3">
                        <details>
                          <summary className="flex cursor-pointer items-start justify-between gap-2 text-sm">
                            <span className="flex-1">
                              {f.title}
                              <span className="block font-mono text-xs text-muted-foreground">
                                {f.file}
                              </span>
                            </span>
                            <Badge variant="outline" className={cn("shrink-0 font-normal", SEVERITY_STYLES[f.severity])}>
                              {f.severity}
                            </Badge>
                          </summary>
                          <p className="mt-2 text-sm text-muted-foreground">{f.fixPrompt}</p>
                        </details>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </>
            ) : null}

            {canManage ? (
              <div className="flex items-center gap-2 border-t border-border pt-3">
                <Checkbox
                  id="code-health-gate"
                  checked={gate}
                  onCheckedChange={(checked) => toggleGate(checked === true)}
                />
                <Label htmlFor="code-health-gate" className="text-sm font-normal text-muted-foreground">
                  Block sending invoices tied to this project until it passes (no critical findings)
                </Label>
              </div>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}
