"use client";

import { useTransition } from "react";
import { MoreHorizontal } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { updateMemberRoleAction, removeMemberAction } from "@/actions/org";

export function MemberRowActions({
  membershipId,
  role,
}: {
  membershipId: string;
  role: "ADMIN" | "MEMBER";
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="size-7" disabled={isPending}>
          <MoreHorizontal className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {role === "MEMBER" ? (
          <DropdownMenuItem
            onSelect={() => startTransition(() => updateMemberRoleAction(membershipId, "ADMIN"))}
          >
            Make admin
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem
            onSelect={() => startTransition(() => updateMemberRoleAction(membershipId, "MEMBER"))}
          >
            Make member
          </DropdownMenuItem>
        )}
        <DropdownMenuItem
          variant="destructive"
          onSelect={() => {
            if (window.confirm("Remove this person from the organization?")) {
              startTransition(() => removeMemberAction(membershipId));
            }
          }}
        >
          Remove
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
