"use client";

import { useRef, useState, type ComponentProps } from "react";
import { Textarea } from "@/components/ui/textarea";
import { mentionToken, splitMentions } from "@/lib/mentions";
import { cn } from "@/lib/utils";

type Person = { id: string; name: string };

/** A textarea where typing "@" offers people to mention. Picking one inserts
 * `@[Name](user:<id>)`, which comments render as a highlighted name. */
export function MentionTextarea({
  people,
  onKeyDown,
  ...props
}: ComponentProps<typeof Textarea> & { people: Person[] }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [query, setQuery] = useState<{ text: string; start: number } | null>(null);
  const [active, setActive] = useState(0);

  const matches = query
    ? people
        .filter((p) => p.name.toLowerCase().includes(query.text.toLowerCase()))
        .slice(0, 6)
    : [];

  function updateQuery() {
    const el = ref.current;
    if (!el) return;
    const before = el.value.slice(0, el.selectionStart);
    const m = before.match(/(^|\s)@([^\s@[\]()]{0,30})$/);
    setQuery(m ? { text: m[2], start: el.selectionStart - m[2].length - 1 } : null);
    setActive(0);
  }

  function insert(person: Person) {
    const el = ref.current;
    if (!el || !query) return;
    const token = `${mentionToken(person)} `;
    const end = el.selectionStart;
    el.setRangeText(token, query.start, end, "end");
    el.focus();
    setQuery(null);
  }

  return (
    <div className="relative">
      <Textarea
        ref={ref}
        {...props}
        onInput={updateQuery}
        onClick={updateQuery}
        onBlur={() => setTimeout(() => setQuery(null), 150)}
        onKeyDown={(e) => {
          if (matches.length > 0) {
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              e.preventDefault();
              const step = e.key === "ArrowDown" ? 1 : -1;
              setActive((i) => (i + step + matches.length) % matches.length);
              return;
            }
            if (e.key === "Enter" || e.key === "Tab") {
              e.preventDefault();
              insert(matches[active]);
              return;
            }
            if (e.key === "Escape") {
              e.preventDefault();
              e.stopPropagation();
              setQuery(null);
              return;
            }
          }
          onKeyDown?.(e);
        }}
        aria-autocomplete="list"
        aria-expanded={matches.length > 0}
      />
      {matches.length > 0 ? (
        <ul
          role="listbox"
          aria-label="People to mention"
          className="absolute bottom-full left-0 z-10 mb-1 w-56 overflow-hidden rounded-md border border-border bg-popover py-1 text-sm shadow-md"
        >
          {matches.map((p, i) => (
            <li key={p.id} role="option" aria-selected={i === active}>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  insert(p);
                }}
                className={cn(
                  "w-full px-3 py-1.5 text-left",
                  i === active ? "bg-accent text-accent-foreground" : "hover:bg-accent/50"
                )}
              >
                {p.name}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** Renders a comment body with mentions highlighted. */
export function CommentBody({ body, viewerId }: { body: string; viewerId?: string }) {
  return <>{renderSegments(body, viewerId)}</>;
}

function renderSegments(body: string, viewerId?: string) {
  return splitMentions(body).map((seg, i) =>
    "text" in seg ? (
      <span key={i}>{seg.text}</span>
    ) : (
      <span
        key={i}
        className={cn(
          "rounded px-0.5 font-medium text-brand",
          seg.userId === viewerId && "bg-brand/10"
        )}
      >
        @{seg.mention}
      </span>
    )
  );
}
