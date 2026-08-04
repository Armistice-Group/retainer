import Link from "next/link";
import { Button } from "@/components/ui/button";

export function SiteHeader({
  isAuthenticated,
  showNav = true,
}: {
  isAuthenticated: boolean;
  showNav?: boolean;
}) {
  return (
    <header className="border-b border-border">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-6">
        <Link href="/" className="text-lg font-semibold tracking-tight">
          <span className="text-primary">Consultainer</span>
        </Link>
        {showNav ? (
          <nav className="hidden items-center gap-8 text-sm text-muted-foreground sm:flex">
            <Link href="/#features" className="hover:text-foreground">
              Features
            </Link>
            <Link href="/#pricing" className="hover:text-foreground">
              Pricing
            </Link>
          </nav>
        ) : null}
        <div className="flex items-center gap-2">
          {isAuthenticated ? (
            <Button size="sm" asChild>
              <Link href="/dashboard">Go to dashboard</Link>
            </Button>
          ) : (
            <>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/login">Log in</Link>
              </Button>
              <Button size="sm" asChild>
                <Link href="/signup">Start free</Link>
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

export function SiteFooter({ isAuthenticated }: { isAuthenticated: boolean }) {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-6 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p>
            <span className="text-primary">Consultainer</span> — client, project, and billing
            management for software consultants.
          </p>
          <p className="mt-1 text-xs">
            Made by{" "}
            <a
              href="https://armisticegroup.com"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-foreground hover:underline"
            >
              Armistice Group LLC
            </a>
          </p>
        </div>
        <div className="flex items-center gap-5">
          <Link href="/terms" className="hover:text-foreground">
            Terms
          </Link>
          <Link href="/privacy" className="hover:text-foreground">
            Privacy
          </Link>
          <Link href={isAuthenticated ? "/dashboard" : "/login"} className="hover:text-foreground">
            {isAuthenticated ? "Dashboard" : "Log in"}
          </Link>
        </div>
      </div>
    </footer>
  );
}
