"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { IntegrationStatus, type IntegrationStatusProps } from "@/components/integration-card-header";
import { IntegrationLogo, type IntegrationLogoName } from "@/components/integration-logo";

/** A titled group of integration rows on the Integrations tab. */
export function IntegrationSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section aria-label={title} className="flex flex-col gap-2">
      <div>
        <h2 className="text-sm font-medium">{title}</h2>
        {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
      </div>
      <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
        {children}
      </ul>
    </section>
  );
}

function Mark({ logos, icon }: { logos: IntegrationLogoName[]; icon?: React.ReactNode }) {
  if (logos.length) {
    return (
      <span className="flex shrink-0 items-center gap-1">
        {logos.map((name) => (
          <IntegrationLogo key={name} name={name} />
        ))}
      </span>
    );
  }
  return icon ? <span className="flex shrink-0 text-muted-foreground [&_svg]:size-5">{icon}</span> : null;
}

/**
 * One service: what it does and whether it's on, in a single line. Its setup
 * (steps, credentials, connect buttons) opens in a side panel, or `href`
 * goes to the settings tab where it lives.
 */
export function IntegrationRow({
  id,
  title,
  logos = [],
  icon,
  description,
  status,
  href,
  actionLabel,
  defaultOpen = false,
  children,
}: {
  /** Opens the panel from ?open=<id> (see the Integrations page). */
  id: string;
  title: string;
  logos?: IntegrationLogoName[];
  /** For services without a brand mark. */
  icon?: React.ReactNode;
  description: React.ReactNode;
  status: IntegrationStatusProps;
  href?: string;
  actionLabel?: string;
  defaultOpen?: boolean;
  /** The panel's content. */
  children?: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const label = actionLabel ?? (href ? "Open" : status.connected ? "Manage" : "Set up");
  return (
    <li id={id} className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center sm:gap-4">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <span className="mt-0.5">
          <Mark logos={logos} icon={icon} />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-medium">{title}</p>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
      </div>
      <div className="flex shrink-0 items-center justify-between gap-3 pl-8 sm:justify-end sm:pl-0">
        <IntegrationStatus {...status} className="sm:max-w-56" />
        {href ? (
          <Button size="sm" variant="outline" asChild>
            <Link href={href}>
              {label} <ChevronRight className="size-3.5" />
            </Link>
          </Button>
        ) : children ? (
          <Button
            size="sm"
            variant="outline"
            onClick={() => setOpen(true)}
            aria-label={`${label} ${title}`}
          >
            {label}
          </Button>
        ) : null}
      </div>
      {children && !href ? (
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetContent className="sm:max-w-lg">
            <SheetHeader>
              <SheetTitle className="flex items-center gap-2">
                <Mark logos={logos} icon={icon} />
                {title}
              </SheetTitle>
              <SheetDescription>{description}</SheetDescription>
              <IntegrationStatus {...status} />
            </SheetHeader>
            <div className="flex flex-col gap-4 overflow-y-auto p-4">{children}</div>
          </SheetContent>
        </Sheet>
      ) : null}
    </li>
  );
}
