import Link from "next/link";
import { ChevronLeft } from "lucide-react";

/** "‹ Clients" above a page title: one step up. */
export function BackLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="mb-2 inline-flex max-w-full items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
    >
      <ChevronLeft className="size-4 shrink-0" />
      <span className="truncate">{children}</span>
    </Link>
  );
}
