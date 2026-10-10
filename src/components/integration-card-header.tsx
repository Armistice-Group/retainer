import { AlertCircle, CheckCircle2 } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { CardHeader, CardTitle } from "@/components/ui/card";
import { IntegrationLogo, type IntegrationLogoName } from "@/components/integration-logo";
import { cn } from "@/lib/utils";

export type IntegrationStatusProps = {
  connected: boolean;
  /** Shown after the label, e.g. the account: "Connected · Acme". */
  detail?: string | null;
  connectedLabel?: string;
  notConnectedLabel?: string;
  /** Something needs attention (e.g. setup unfinished, unreachable). Replaces
   * the not-connected label. */
  problem?: string | null;
  className?: string;
};

/** "Connected · <detail>" with a green check, or a muted "Not connected". */
export function IntegrationStatus({
  connected,
  detail,
  connectedLabel = "Connected",
  notConnectedLabel = "Not connected",
  problem,
  className,
}: IntegrationStatusProps) {
  if (problem) {
    return (
      <span className={cn("flex items-center gap-1.5 text-sm text-destructive", className)}>
        <AlertCircle className="size-3.5 shrink-0" />
        {problem}
      </span>
    );
  }
  if (!connected) {
    return <span className={cn("text-sm text-muted-foreground", className)}>{notConnectedLabel}</span>;
  }
  const text = detail ? `${connectedLabel} · ${detail}` : connectedLabel;
  return (
    <span className={cn("flex min-w-0 items-center gap-1.5 text-sm text-muted-foreground", className)} title={text}>
      <CheckCircle2 className="size-3.5 shrink-0 text-chart-3" />
      <span className="truncate">{text}</span>
    </span>
  );
}

/** The shared header for integration cards: logo and name on the left,
 * connection status on the right, optional description underneath. */
export function IntegrationCardHeader({
  title,
  logos = [],
  icon: Icon,
  description,
  status,
  action,
}: {
  title: React.ReactNode;
  logos?: IntegrationLogoName[];
  /** For services without a brand mark (generic storage, iCal). */
  icon?: LucideIcon;
  description?: React.ReactNode;
  status: IntegrationStatusProps;
  /** Extra control beside the status, e.g. a Sync now button. */
  action?: React.ReactNode;
}) {
  return (
    <CardHeader className="flex flex-col gap-1.5">
      <div className="flex w-full flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <CardTitle className="flex min-w-0 items-center gap-2 text-base">
          {logos.length ? (
            <span className="flex shrink-0 items-center gap-1">
              {logos.map((name) => (
                <IntegrationLogo key={name} name={name} />
              ))}
            </span>
          ) : Icon ? (
            <Icon className="size-5 shrink-0 text-muted-foreground" aria-hidden />
          ) : null}
          <span className="min-w-0">{title}</span>
        </CardTitle>
        <div className="flex min-w-0 max-w-full items-center gap-3 sm:max-w-[60%]">
          <IntegrationStatus {...status} />
          {action}
        </div>
      </div>
      {description ? <div className="text-sm text-muted-foreground">{description}</div> : null}
    </CardHeader>
  );
}
