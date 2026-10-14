"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Clock, Inbox, LayoutGrid, Receipt } from "lucide-react";
import { cn } from "@/lib/utils";

/** The phone view's bottom tabs, clear of Android's gesture bar. */
export function PhoneTabs({ canManage }: { canManage: boolean }) {
  const pathname = usePathname();
  const tabs = [
    { href: "/m", label: "Today", icon: Clock, active: pathname === "/m" },
    { href: "/m/share", label: "Inbox", icon: Inbox, active: pathname.startsWith("/m/share") },
    ...(canManage
      ? [{ href: "/m/invoices", label: "Owed", icon: Receipt, active: pathname.startsWith("/m/invoices") }]
      : []),
    { href: "/dashboard", label: "Full app", icon: LayoutGrid, active: false },
  ];
  return (
    <nav
      aria-label="Phone"
      className="fixed inset-x-0 bottom-0 z-10 border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
    >
      <ul className="mx-auto flex max-w-md">
        {tabs.map((tab) => (
          <li key={tab.href} className="flex-1">
            <Link
              href={tab.href}
              aria-current={tab.active ? "page" : undefined}
              className={cn(
                "flex flex-col items-center gap-0.5 py-2.5 text-xs",
                tab.active ? "text-brand" : "text-muted-foreground"
              )}
            >
              <tab.icon className="size-5" />
              {tab.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
