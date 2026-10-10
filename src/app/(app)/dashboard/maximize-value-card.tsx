import Link from "next/link";
import { Check, Landmark, ListTodo, MessageSquare, Receipt, Bot } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DismissSetupCardButton } from "./dismiss-setup-card-button";
import { cn } from "@/lib/utils";

export type MaximizeValueItem = {
  key: string;
  label: string;
  description: string;
  href: string;
  done: boolean;
};

const ICONS: Record<string, typeof Landmark> = {
  quickbooks: Landmark,
  linear: ListTodo,
  slack: MessageSquare,
  payment: Receipt,
  mcp: Bot,
};

export function MaximizeValueCard({ items }: { items: MaximizeValueItem[] }) {
  const doneCount = items.filter((i) => i.done).length;
  if (doneCount === items.length) return null;

  return (
    <Card className="mb-8">
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-base">Get more out of Consultainer</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            {doneCount} of {items.length} connected — each one closes another gap where work or
            money can slip through.
          </p>
        </div>
        <DismissSetupCardButton />
      </CardHeader>
      <CardContent className="p-0">
        <ul className="flex flex-col divide-y divide-border">
          {items.map((item) => {
            const Icon = ICONS[item.key] ?? Landmark;
            return (
              <li key={item.key}>
                <Link
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 px-6 py-3 text-sm hover:bg-muted/50",
                    item.done && "opacity-60"
                  )}
                >
                  <span
                    className={cn(
                      "flex size-6 shrink-0 items-center justify-center rounded-full border",
                      item.done
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border text-muted-foreground"
                    )}
                  >
                    {item.done ? <Check className="size-3.5" /> : <Icon className="size-3.5" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className={cn("font-medium", item.done && "line-through")}>{item.label}</p>
                    <p className="text-xs text-muted-foreground">{item.description}</p>
                  </div>
                  {!item.done ? (
                    <span className="shrink-0 text-xs text-brand">Set up</span>
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
