"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const orgLinks = [
  { href: "/settings", label: "General" },
  { href: "/settings/security", label: "Security" },
  { href: "/settings/integrations", label: "Integrations" },
  { href: "/settings/members", label: "Members" },
];

const personalLinks = [{ href: "/settings/profile", label: "Profile" }];

function TabLink({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      className={cn(
        "border-b-2 px-3 py-2 text-sm font-medium transition-colors",
        active
          ? "border-primary text-foreground"
          : "border-transparent text-muted-foreground hover:text-foreground"
      )}
    >
      {label}
    </Link>
  );
}

export function SettingsNav() {
  const pathname = usePathname();

  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between sm:border-b sm:border-border">
      <div>
        <p className="px-3 pt-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Organization
        </p>
        <div className="flex gap-1">
          {orgLinks.map((link) => (
            <TabLink key={link.href} {...link} active={pathname === link.href} />
          ))}
        </div>
      </div>
      <div>
        <p className="px-3 pt-1 text-xs font-medium uppercase tracking-wide text-muted-foreground sm:text-right">
          Personal
        </p>
        <div className="flex gap-1 sm:justify-end">
          {personalLinks.map((link) => (
            <TabLink key={link.href} {...link} active={pathname === link.href} />
          ))}
        </div>
      </div>
    </div>
  );
}
