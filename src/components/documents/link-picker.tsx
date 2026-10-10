"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Loader2, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { DocumentIcon } from "./provider-icon";
import { resolvePickAction, searchFilesAction } from "@/actions/file-connections";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { PickerItem } from "@/lib/integrations/storage/types";

const LABELS: Record<string, string> = {
  GOOGLE_DRIVE: "Google Drive",
  DROPBOX: "Dropbox",
  ONEDRIVE: "OneDrive",
  NOTION: "Notion",
};

/** Browse and search the viewer's connected Drive/Dropbox/OneDrive/Notion
 * (with their own access) to pick something to link. */
export function LinkPicker({
  providers,
  onPick,
}: {
  providers: string[];
  onPick: (url: string, title: string) => void;
}) {
  const [provider, setProvider] = useState(providers[0]);
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<PickerItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [picking, startPick] = useTransition();
  const [picked, setPicked] = useState<string | null>(null);
  const request = useRef(0);

  useEffect(() => {
    const id = ++request.current;
    const timer = setTimeout(async () => {
      setLoading(true);
      const r = await searchFilesAction(provider, query);
      if (id !== request.current) return;
      setLoading(false);
      setError(r.error ?? null);
      setItems(r.items ?? []);
    }, query ? 300 : 0);
    return () => clearTimeout(timer);
  }, [provider, query]);

  function pick(item: PickerItem) {
    setPicked(item.id);
    startPick(async () => {
      const r = await resolvePickAction(provider, item.url);
      if (r.url) onPick(r.url, item.title);
      else setError(r.error ?? "Couldn't link that item.");
    });
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border p-2">
      {providers.length > 1 ? (
        <div className="flex flex-wrap gap-1" role="tablist">
          {providers.map((p) => (
            <button
              key={p}
              type="button"
              role="tab"
              aria-selected={p === provider}
              onClick={() => setProvider(p)}
              className={cn(
                "flex items-center gap-1.5 rounded px-2 py-1 text-xs",
                p === provider ? "bg-accent font-medium" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <DocumentIcon source={p} className="size-3.5" /> {LABELS[p] ?? p}
            </button>
          ))}
        </div>
      ) : null}
      <div className="relative">
        <Search className="absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`Search ${LABELS[provider] ?? provider}…`}
          className="h-8 pl-7"
          aria-label={`Search ${LABELS[provider] ?? provider}`}
        />
      </div>
      <ul className="flex max-h-56 flex-col overflow-y-auto" aria-busy={loading}>
        {loading && items.length === 0 ? (
          <li className="flex items-center gap-2 px-2 py-3 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" /> Loading…
          </li>
        ) : error ? (
          <li className="px-2 py-3 text-xs text-destructive">{error}</li>
        ) : items.length === 0 ? (
          <li className="px-2 py-3 text-xs text-muted-foreground">
            {query ? "Nothing matches." : "Nothing here yet."}
            {provider === "NOTION"
              ? " Only pages you shared when connecting Notion show up; to share more, disconnect and reconnect it on your profile."
              : provider === "ONEDRIVE"
                ? " This searches your own OneDrive; paste SharePoint links below."
                : ""}
          </li>
        ) : (
          items.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => pick(item)}
                disabled={picking}
                className={cn(
                  "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-accent/60",
                  picked === item.id && "bg-accent"
                )}
              >
                <DocumentIcon source={provider} kind={item.kind} className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate">{item.title}</span>
                {picking && picked === item.id ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : item.modifiedAt ? (
                  <span className="shrink-0 text-xs text-muted-foreground">{formatDate(item.modifiedAt)}</span>
                ) : null}
              </button>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
