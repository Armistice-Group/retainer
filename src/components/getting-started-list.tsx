import Link from "next/link";
import { CheckCircle2, Circle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { GettingStartedStep } from "@/lib/services/getting-started";

/** Rows of a getting-started checklist; the next step to do is highlighted. */
export function GettingStartedList({ steps }: { steps: GettingStartedStep[] }) {
  const next = steps.find((s) => !s.done)?.key;
  return (
    <ul className="flex flex-col divide-y divide-border">
      {steps.map((step) => (
        <li key={step.key} className="flex items-start gap-3 px-6 py-3.5">
          {step.done ? (
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-chart-3" aria-label="Done" />
          ) : (
            <Circle className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-label="To do" />
          )}
          <div className="min-w-0 flex-1">
            <p className={cn("text-sm font-medium", step.done && "text-muted-foreground line-through")}>
              {step.title}
            </p>
            <p className="mt-0.5 text-sm text-muted-foreground">{step.description}</p>
          </div>
          {!step.done ? (
            <Button asChild variant={step.key === next ? "default" : "outline"} size="sm" className="shrink-0">
              <Link href={step.href}>{step.cta}</Link>
            </Button>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
