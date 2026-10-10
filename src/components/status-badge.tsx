import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const STYLES: Record<string, string> = {
  ACTIVE: "bg-chart-3/15 text-chart-3 border-chart-3/30",
  INACTIVE: "bg-muted text-muted-foreground border-border",
  LEAD: "bg-chart-4/15 text-chart-4 border-chart-4/30",
  ON_HOLD: "bg-chart-4/15 text-chart-4 border-chart-4/30",
  COMPLETED: "bg-chart-2/15 text-chart-2 border-chart-2/30",
  ARCHIVED: "bg-muted text-muted-foreground border-border",
  DRAFT: "bg-muted text-muted-foreground border-border",
  SENT: "bg-chart-2/15 text-chart-2 border-chart-2/30",
  PAID: "bg-chart-3/15 text-chart-3 border-chart-3/30",
  VOID: "bg-destructive/10 text-destructive border-destructive/30",
  TODO: "bg-muted text-muted-foreground border-border",
  IN_PROGRESS: "bg-chart-2/15 text-chart-2 border-chart-2/30",
  DONE: "bg-chart-3/15 text-chart-3 border-chart-3/30",
  PENDING: "bg-muted text-muted-foreground border-border",
  INVOICED: "bg-chart-3/15 text-chart-3 border-chart-3/30",
  APPROVED: "bg-chart-3/15 text-chart-3 border-chart-3/30",
  REJECTED: "bg-destructive/10 text-destructive border-destructive/30",
  ACCEPTED: "bg-chart-3/15 text-chart-3 border-chart-3/30",
  DECLINED: "bg-destructive/10 text-destructive border-destructive/30",
  EXPIRED: "bg-muted text-muted-foreground border-border",
};

const LABELS: Record<string, string> = {
  ACTIVE: "Active",
  INACTIVE: "Inactive",
  LEAD: "Draft client",
  ON_HOLD: "On hold",
  COMPLETED: "Completed",
  ARCHIVED: "Archived",
  DRAFT: "Draft",
  SENT: "Sent",
  PAID: "Paid",
  VOID: "Void",
  TODO: "To do",
  IN_PROGRESS: "In progress",
  DONE: "Done",
  PENDING: "Pending",
  INVOICED: "Invoiced",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  ACCEPTED: "Accepted",
  DECLINED: "Declined",
  EXPIRED: "Expired",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <Badge variant="outline" className={cn("font-normal", STYLES[status])}>
      {LABELS[status] ?? status}
    </Badge>
  );
}
