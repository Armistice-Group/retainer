"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const links = [
  { href: "/settings", label: "General" },
  { href: "/settings/security", label: "Security" },
  { href: "/settings/integrations", label: "Integrations" },
  { href: "/settings/members", label: "Members" },
];

export function SettingsNav() {
  const pathname = usePathname();

  return (
    <div className="mb-6 flex gap-1 border-b border-border">
      {links.map((link) => {
        const active = pathname === link.href;
        return (
          <Link
            key={link.href}
            href={link.href}
            className={cn(
              "border-b-2 px-3 py-2 text-sm font-medium transition-colors",
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
