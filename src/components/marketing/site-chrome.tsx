import Link from "next/link";
import { Menu, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";

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
        <Link href="/" className="font-mono text-lg font-medium tracking-tight">
          <span className="text-primary">Consultainer</span>
        </Link>
        {showNav ? (
          <nav className="hidden items-center gap-8 font-mono text-xs tracking-wide text-muted-foreground uppercase sm:flex">
            <Link href="/#features" className="hover:text-foreground">
              Features
            </Link>
            <Link href="/pricing" className="hover:text-foreground">
              Pricing
            </Link>
            <Link href="/compare" className="hover:text-foreground">
              Compare
            </Link>
          </nav>
        ) : null}
        <div className="flex items-center gap-2">
          {showNav ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="sm:hidden" aria-label="Menu">
                  <Menu className="size-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem asChild>
                  <Link href="/#features" className="font-mono text-xs tracking-wide uppercase">
                    Features
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/pricing" className="font-mono text-xs tracking-wide uppercase">
                    Pricing
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/compare" className="font-mono text-xs tracking-wide uppercase">
                    Compare
                  </Link>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
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
            <span className="font-mono text-primary">Consultainer</span> — run engineering
            engagements from the tools you already build in.
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
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 font-mono text-xs tracking-wide uppercase">
          <Link href="/pricing" className="hover:text-foreground">
            Pricing
          </Link>
          <Link href="/compare" className="hover:text-foreground">
            Compare
          </Link>
          <Link href="/security" className="hover:text-foreground">
            Security
          </Link>
          <Link href="/terms" className="hover:text-foreground">
            Terms
          </Link>
          <Link href="/privacy" className="hover:text-foreground">
            Privacy
          </Link>
          <Link href="/contact" className="hover:text-foreground">
            Contact
          </Link>
          <Link href={isAuthenticated ? "/dashboard" : "/login"} className="hover:text-foreground">
            {isAuthenticated ? "Dashboard" : "Log in"}
          </Link>
        </div>
      </div>
    </footer>
  );
}

export function ClosingCta({ isAuthenticated }: { isAuthenticated: boolean }) {
  return (
    <section className="border-t border-border">
      <div className="mx-auto flex w-full max-w-6xl flex-col items-center gap-5 px-6 py-20 text-center">
        <h2 className="text-3xl font-semibold tracking-tight">
          {isAuthenticated
            ? "Pick up where you left off."
            : "Set up your workspace in under a minute."}
        </h2>
        <Button size="lg" asChild>
          <Link href={isAuthenticated ? "/dashboard" : "/signup"}>
            {isAuthenticated ? "Go to dashboard" : "Start free"} <ArrowRight className="size-4" />
          </Link>
        </Button>
        {!isAuthenticated ? (
          <p className="text-sm text-muted-foreground">
            Free for up to 2 clients. No credit card required.
          </p>
        ) : null}
      </div>
    </section>
  );
}
