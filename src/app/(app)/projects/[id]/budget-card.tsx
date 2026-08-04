import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function BudgetCard({
  budgetHours,
  loggedHours,
}: {
  budgetHours: number;
  loggedHours: number;
}) {
  const percent = Math.min(100, (loggedHours / budgetHours) * 100);
  const over = loggedHours > budgetHours;
  const nearLimit = !over && percent >= 80;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Budget</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between text-sm">
          <span className="tabular-figures font-medium">
            {loggedHours.toFixed(2)}h <span className="text-muted-foreground">of {budgetHours.toFixed(2)}h</span>
          </span>
          <span
            className={cn(
              "tabular-figures text-xs",
              over ? "text-destructive" : nearLimit ? "text-chart-4" : "text-muted-foreground"
            )}
          >
            {Math.round(percent)}%
          </span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
          <div
            className={cn(
              "h-full rounded-full transition-all",
              over ? "bg-destructive" : nearLimit ? "bg-chart-4" : "bg-primary"
            )}
            style={{ width: `${percent}%` }}
          />
        </div>
        {over ? (
          <p className="text-xs text-destructive">
            {(loggedHours - budgetHours).toFixed(2)}h over budget
          </p>
        ) : nearLimit ? (
          <p className="text-xs text-chart-4">
            {(budgetHours - loggedHours).toFixed(2)}h remaining
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
