import { Badge } from "@/components/ui/badge";

/** A task's Linear issue key (e.g. RING-12), linking to the issue. */
export function LinearKeyBadge({ linearKey, url }: { linearKey: string | null; url: string | null }) {
  if (!linearKey) return null;
  const badge = (
    <Badge variant="outline" className="font-mono text-[11px] font-normal text-muted-foreground">
      {linearKey}
    </Badge>
  );
  return url ? (
    <a href={url} target="_blank" rel="noreferrer" title="Open in Linear" className="shrink-0">
      {badge}
    </a>
  ) : (
    badge
  );
}
