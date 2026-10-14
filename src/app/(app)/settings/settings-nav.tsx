"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const links = [
  { href: "/settings", label: "General" },
  { href: "/settings/security", label: "Security" },
  { href: "/settings/integrations", label: "Integrations" },
  { href: "/settings/members", label: "Members" },
];

export function SettingsNav({ showAuditLog }: { showAuditLog: boolean }) {
  const pathname = usePathname();
  const activeRef = useRef<HTMLAnchorElement>(null);
  // Admin-only tabs.
  const visible = showAuditLog
    ? [
        links[0],
        { href: "/settings/payments", label: "Payments" },
        ...links.slice(1),
        { href: "/settings/agreements", label: "Agreements" },
        { href: "/settings/scheduling", label: "Scheduling" },
        { href: "/settings/alerts", label: "Alerts" },
        { href: "/settings/import", label: "Import" },
        { href: "/settings/export", label: "Export" },
        { href: "/settings/audit", label: "Audit log" },
      ]
    : links;

  // On a phone most tabs are off screen: keep the current one in view.
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [pathname]);

  return (
    <div className="relative mb-6">
      <div className="flex gap-1 overflow-x-auto border-b border-border [scrollbar-width:none]">
        {visible.map((link) => {
          const active = pathname === link.href;
          return (
            <Link
              key={link.href}
              ref={active ? activeRef : undefined}
              href={link.href}
              className={cn(
                "shrink-0 border-b-2 px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              {link.label}
            </Link>
          );
        })}
      </div>
      {/* Fades the last tab to show the row scrolls. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-background to-transparent md:hidden"
      />
    </div>
  );
}
