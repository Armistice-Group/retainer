import { cn } from "@/lib/utils";

/** Consultainer's clock mark: a monochrome tile and face, with the minute
 * hand in the brand accent — the one spot of color in the chrome. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={cn("size-6 shrink-0", className)}>
      <rect width="24" height="24" rx="6" className="fill-foreground" />
      <circle cx="12" cy="12" r="6.6" fill="none" strokeWidth="1.9" className="stroke-background" />
      <path d="M12 12V8.4" strokeWidth="1.9" strokeLinecap="round" className="stroke-background" />
      <path d="M12 12l2.9 1.7" strokeWidth="1.9" strokeLinecap="round" className="stroke-brand" />
    </svg>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("flex items-center gap-2 font-semibold tracking-tight", className)}>
      <BrandMark />
      Consultainer
    </span>
  );
}
