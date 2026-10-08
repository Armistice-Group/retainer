import { cn } from "@/lib/utils";

/** Monochrome app mark: an open ring (a clock face, or a "C") with an
 * emerald dot where it opens — the one spot of brand color in the chrome. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={cn("size-6", className)}>
      <rect width="24" height="24" rx="6" className="fill-foreground" />
      <path
        d="M14.6 8.4A5 5 0 1 0 14.6 15.6"
        fill="none"
        strokeWidth="2.4"
        strokeLinecap="round"
        className="stroke-background"
      />
      <circle cx="17.3" cy="12" r="2" className="fill-brand" />
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
