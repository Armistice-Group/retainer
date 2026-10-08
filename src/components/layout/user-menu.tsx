"use client";

import { LogOut, User as UserIcon } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { signOutAction } from "@/actions/session";

function initials(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

// Stamped into the image at build time (see Dockerfile / docker.yml), so it's
// obvious which build a server is actually running.
const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION || "dev";
const APP_REVISION = (process.env.NEXT_PUBLIC_APP_REVISION || "").slice(0, 7);

export function UserMenu({ name, email }: { name: string; email: string }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex items-center gap-2 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <Avatar className="size-8">
            <AvatarFallback className="text-xs">{initials(name)}</AvatarFallback>
          </Avatar>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="flex flex-col gap-0.5">
          <span className="text-sm font-medium">{name}</span>
          <span className="text-xs font-normal text-muted-foreground">{email}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <a href="/profile" className="flex items-center gap-2">
            <UserIcon className="size-4" />
            Profile
          </a>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <form action={signOutAction}>
          <button type="submit" className="w-full">
            <DropdownMenuItem asChild>
              <span className="flex items-center gap-2 text-destructive">
                <LogOut className="size-4" />
                Log out
              </span>
            </DropdownMenuItem>
          </button>
        </form>
        <DropdownMenuSeparator />
        <p className="px-2 py-1 text-xs text-muted-foreground">
          Consultainer {APP_VERSION}
          {APP_REVISION ? ` (${APP_REVISION})` : ""}
        </p>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
