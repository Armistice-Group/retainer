"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/status-badge";
import { EmptyState } from "@/components/empty-state";
import { ConfirmSubmitButton } from "@/components/forms/confirm-submit-button";
import { Flag, Trash2, RotateCcw, Paperclip, ExternalLink } from "lucide-react";
import { AddMilestoneDialog } from "./add-milestone-dialog";
import { CompleteMilestoneDialog } from "./complete-milestone-dialog";
import { deleteMilestoneAction, reopenMilestoneAction } from "@/actions/milestones";
import { formatCurrency, formatDate } from "@/lib/format";

export type MilestoneItem = {
  id: string;
  name: string;
  description: string | null;
  amount: number;
  dueDate: string | null;
  completedAt: string | null;
  completedByName: string | null;
  completionNote: string | null;
  completionUrl: string | null;
  hasEvidenceFile: boolean;
  invoicedAt: string | null;
};

function milestoneStatus(m: MilestoneItem) {
  if (m.invoicedAt) return "INVOICED";
  if (m.completedAt) return "COMPLETED";
  return "PENDING";
}

export function MilestonesCard({
  projectId,
  milestones,
  currency,
  canManage,
}: {
  projectId: string;
  milestones: MilestoneItem[];
  currency: string;
  canManage: boolean;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  function toggleExpanded(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Milestones</CardTitle>
        {canManage ? <AddMilestoneDialog projectId={projectId} /> : null}
      </CardHeader>
      <CardContent>
        {milestones.length === 0 ? (
          <EmptyState
            icon={Flag}
            title="No milestones yet"
            description="Add fixed-price milestones to bill this project by deliverable instead of by the hour."
          />
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {milestones.map((m) => {
              const status = milestoneStatus(m);
              const isExpanded = expanded.has(m.id);
              return (
                <li key={m.id} className="flex flex-col gap-2 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 text-sm">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{m.name}</span>
                        <StatusBadge status={status} />
                      </div>
                      {m.description ? (
                        <p className="mt-0.5 text-muted-foreground">{m.description}</p>
                      ) : null}
                      <p className="mt-0.5 text-muted-foreground">
                        {formatCurrency(m.amount, currency)}
                        {m.dueDate ? ` · Due ${formatDate(m.dueDate)}` : ""}
                        {m.completedAt
                          ? ` · Completed ${formatDate(m.completedAt)}${m.completedByName ? ` by ${m.completedByName}` : ""}`
                          : ""}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      {status === "PENDING" && canManage ? (
                        <CompleteMilestoneDialog
                          projectId={projectId}
                          milestoneId={m.id}
                          milestoneName={m.name}
                        />
                      ) : null}
                      {status !== "PENDING" ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => toggleExpanded(m.id)}
                        >
                          {isExpanded ? "Hide evidence" : "View evidence"}
                        </Button>
                      ) : null}
                      {status === "COMPLETED" && canManage ? (
                        <form action={reopenMilestoneAction.bind(null, m.id, projectId)}>
                          <Button variant="ghost" size="icon" className="size-7" type="submit">
                            <RotateCcw className="size-3.5" />
                          </Button>
                        </form>
                      ) : null}
                      {status !== "INVOICED" && canManage ? (
                        <form action={deleteMilestoneAction.bind(null, m.id, projectId)}>
                          <ConfirmSubmitButton
                            variant="ghost"
                            size="icon"
                            className="size-7"
                            confirmMessage={`Delete milestone "${m.name}"?`}
                          >
                            <Trash2 className="size-3.5" />
                          </ConfirmSubmitButton>
                        </form>
                      ) : null}
                    </div>
                  </div>

                  {isExpanded && status !== "PENDING" ? (
                    <div className="rounded-md border border-border bg-muted/30 p-3 text-sm">
                      <p className="whitespace-pre-wrap">{m.completionNote}</p>
                      <div className="mt-2 flex flex-wrap gap-3">
                        {m.completionUrl ? (
                          <a
                            href={m.completionUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 text-primary hover:underline"
                          >
                            <ExternalLink className="size-3.5" /> Link
                          </a>
                        ) : null}
                        {m.hasEvidenceFile ? (
                          <a
                            href={`/api/milestones/${m.id}/evidence`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 text-primary hover:underline"
                          >
                            <Paperclip className="size-3.5" /> Attached file
                          </a>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
