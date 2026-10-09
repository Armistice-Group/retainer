"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const links = [
  { href: "/settings", label: "General" },
  { href: "/settings/payments", label: "Payments" },
  { href: "/settings/security", label: "Security" },
  { href: "/settings/integrations", label: "Integrations" },
  { href: "/settings/members", label: "Members" },
];

export function SettingsNav({ showAuditLog }: { showAuditLog: boolean }) {
  const pathname = usePathname();
  // Admin-only tabs.
  const visible = showAuditLog
    ? [
        ...links,
        { href: "/settings/alerts", label: "Alerts" },
        { href: "/settings/audit", label: "Audit log" },
      ]
    : links;

  return (
    <div className="mb-6 flex gap-1 overflow-x-auto border-b border-border">
      {visible.map((link) => {
        const active = pathname === link.href;
        return (
          <Link
            key={link.href}
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
  );
}
