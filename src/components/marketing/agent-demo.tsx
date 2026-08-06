"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Check } from "lucide-react";
import { Card } from "@/components/ui/card";

type Line = { type: "prompt" | "response"; text: string; success?: boolean };

// Mirrors the real MCP tool surface (src/app/api/[transport]/route.ts):
// list_projects, list_my_tasks, log_time, update_task_status, list_invoices.
// "Let's work in API v2" isn't a tool call — the server has no session state,
// so the agent just carries the project id forward in later calls, same as
// a person would.
const SCRIPT: Line[] = [
  { type: "prompt", text: "agent: what projects do I have for Fintra Labs?" },
  { type: "response", text: "API v2, Portal redesign — 2 active projects" },
  { type: "prompt", text: "agent: let's work in API v2 from here" },
  { type: "response", text: "Using Fintra Labs / API v2 for this session" },
  { type: "prompt", text: "agent: what's open for me on this project?" },
  { type: "response", text: "Auth flow review, API migration — 2 tasks" },
  { type: "prompt", text: "agent: log 3.5h on the API migration task" },
  { type: "response", text: "Logged 3.50h — API migration", success: true },
  { type: "prompt", text: "agent: mark the API migration task done" },
  { type: "response", text: "API migration → Done", success: true },
  { type: "prompt", text: "agent: what's the invoice status for Fintra Labs?" },
  { type: "response", text: "1 draft — INV-0004, $2,100.00 due" },
];

const WINDOW_SIZE = 5;
const TYPE_MS = 42;
const AFTER_PROMPT_MS = 500;
const AFTER_RESPONSE_MS = 1800;
const AFTER_SCRIPT_MS = 3200;
const RESTART_MS = 700;

function wait(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function subscribeReducedMotion(callback: () => void) {
  const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
  mql.addEventListener("change", callback);
  return () => mql.removeEventListener("change", callback);
}

function getReducedMotionSnapshot() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

// No media query on the server — assume motion is fine until the client re-syncs.
function getReducedMotionServerSnapshot() {
  return false;
}

export function AgentDemo() {
  const reducedMotion = useSyncExternalStore(
    subscribeReducedMotion,
    getReducedMotionSnapshot,
    getReducedMotionServerSnapshot
  );
  const [visibleCount, setVisibleCount] = useState(0);
  const [typedChars, setTypedChars] = useState(0);

  useEffect(() => {
    if (reducedMotion) return;

    let cancelled = false;

    async function run() {
      while (!cancelled) {
        for (let i = 0; i < SCRIPT.length && !cancelled; i++) {
          const line = SCRIPT[i];
          if (line.type === "prompt") {
            for (let c = 1; c <= line.text.length && !cancelled; c++) {
              setTypedChars(c);
              await wait(TYPE_MS);
            }
            if (cancelled) return;
            setVisibleCount(i + 1);
            setTypedChars(0);
            await wait(AFTER_PROMPT_MS);
          } else {
            setVisibleCount(i + 1);
            await wait(AFTER_RESPONSE_MS);
          }
        }
        if (cancelled) return;
        await wait(AFTER_SCRIPT_MS);
        if (cancelled) return;
        setVisibleCount(0);
        await wait(RESTART_MS);
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [reducedMotion]);

  const displayCount = reducedMotion ? SCRIPT.length : visibleCount;
  const current = SCRIPT[displayCount];
  const isTyping = !reducedMotion && current?.type === "prompt" && typedChars > 0;

  const rows = SCRIPT.slice(0, displayCount).map((line, i) => ({
    key: `line-${i}`,
    node:
      line.type === "prompt" ? (
        <p className="text-muted-foreground">&gt; {line.text}</p>
      ) : (
        <p className="flex items-center gap-2 text-foreground">
          {line.success ? <Check className="size-4 shrink-0 text-chart-3" /> : null}
          {line.text}
        </p>
      ),
  }));

  if (isTyping) {
    rows.push({
      key: "typing",
      node: (
        <p className="text-muted-foreground">
          &gt; {current.text.slice(0, typedChars)}
          <span className="ml-0.5 inline-block h-3.5 w-1.5 animate-pulse bg-muted-foreground align-middle" />
        </p>
      ),
    });
  } else if (displayCount === 0) {
    rows.push({
      key: "idle",
      node: (
        <p className="text-muted-foreground">
          &gt;{" "}
          <span className="ml-0.5 inline-block h-3.5 w-1.5 animate-pulse bg-muted-foreground align-middle" />
        </p>
      ),
    });
  }

  const visibleRows = rows.slice(-WINDOW_SIZE);

  return (
    <Card className="h-56 justify-end gap-3 overflow-hidden p-5 font-mono text-sm">
      {visibleRows.map((row) => (
        <div key={row.key}>{row.node}</div>
      ))}
    </Card>
  );
}
