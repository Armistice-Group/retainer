"use client";

import { useTransition } from "react";
import { Check, ChevronsUpDown, Building2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { switchOrgAction } from "@/actions/org";
import { cn } from "@/lib/utils";

type Membership = { orgId: string; role: string; org: { id: string; name: string } };

export function OrgSwitcher({
  memberships,
  activeOrgId,
}: {
  memberships: Membership[];
  activeOrgId: string;
}) {
  const [isPending, startTransition] = useTransition();
  const active = memberships.find((m) => m.orgId === activeOrgId);

  if (memberships.length <= 1) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 text-sm font-semibold">
        <Building2 className="size-4 shrink-0 text-muted-foreground" />
        <span className="truncate">{active?.org.name}</span>
      </div>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-semibold hover:bg-sidebar-accent"
          disabled={isPending}
        >
          <Building2 className="size-4 shrink-0 text-muted-foreground" />
          <span className="flex-1 truncate">{active?.org.name}</span>
          <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        {memberships.map((m) => (
          <DropdownMenuItem
            key={m.orgId}
            onSelect={() => startTransition(() => switchOrgAction(m.orgId))}
            className={cn("flex items-center justify-between gap-2")}
          >
            <span className="truncate">{m.org.name}</span>
            {m.orgId === activeOrgId ? <Check className="size-4" /> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
