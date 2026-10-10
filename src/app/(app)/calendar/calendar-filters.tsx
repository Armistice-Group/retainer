"use client";

import { useRouter, useSearchParams } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { CALENDAR_STYLE } from "@/components/calendar/item-style";
import type { CalendarType } from "@/lib/services/calendar-items";

const ALL = "all";

export function CalendarFilters({
  types,
  activeTypes,
  clients,
  projects,
}: {
  /** The kinds this person can see, with labels. */
  types: { type: CalendarType; label: string }[];
  activeTypes: CalendarType[];
  clients: { id: string; name: string }[];
  projects: { id: string; name: string; clientId: string }[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const clientId = searchParams.get("client") ?? ALL;
  const projectId = searchParams.get("project") ?? ALL;
  const tasks = searchParams.get("tasks") === "all" ? "all" : "mine";

  function go(change: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(change)) {
      if (value === null || value === ALL) params.delete(key);
      else params.set(key, value);
    }
    const qs = params.toString();
    router.push(qs ? `/calendar?${qs}` : "/calendar");
  }

  function toggleType(type: CalendarType) {
    const on = new Set(activeTypes);
    if (on.has(type)) on.delete(type);
    else on.add(type);
    // All on (or none) = no filter.
    const list = types.map((t) => t.type).filter((t) => on.has(t));
    go({ types: list.length === 0 || list.length === types.length ? null : list.join(",") });
  }

  const shownProjects = clientId === ALL ? projects : projects.filter((p) => p.clientId === clientId);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={clientId} onValueChange={(v) => go({ client: v, project: null })}>
          <SelectTrigger className="h-8 w-48" aria-label="Client">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All clients</SelectItem>
            {clients.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={projectId} onValueChange={(v) => go({ project: v })}>
          <SelectTrigger className="h-8 w-56" aria-label="Project">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All projects</SelectItem>
            {shownProjects.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={tasks} onValueChange={(v) => go({ tasks: v === "all" ? "all" : null })}>
          <SelectTrigger className="h-8 w-48" aria-label="Whose tasks">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="mine">My tasks</SelectItem>
            <SelectItem value="all">Everyone&apos;s tasks</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Show">
        {types.map(({ type, label }) => {
          const { icon: Icon, className } = CALENDAR_STYLE[type];
          const active = activeTypes.includes(type);
          return (
            <button
              key={type}
              type="button"
              onClick={() => toggleType(type)}
              aria-pressed={active}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors",
                active
                  ? "border-border bg-accent text-accent-foreground"
                  : "border-dashed border-border text-muted-foreground opacity-70 hover:opacity-100"
              )}
            >
              <Icon className={cn("size-3.5", className)} />
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
