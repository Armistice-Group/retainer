"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Check } from "lucide-react";
import { Card } from "@/components/ui/card";

type Line = { type: "prompt" | "response"; text: string; success?: boolean };

const SCRIPT: Line[] = [
  { type: "prompt", text: "agent: what's open for Fintra Labs?" },
  { type: "response", text: "Auth flow review, API migration — 2 tasks open" },
  { type: "prompt", text: "agent: log 3.5h on the API migration" },
  { type: "response", text: "Logged 3.50h — Fintra Labs / API migration", success: true },
  { type: "prompt", text: "agent: generate this month's invoice" },
  { type: "response", text: "INV-0004 created — $2,100.00 due", success: true },
];

const TYPE_MS = 28;
const AFTER_PROMPT_MS = 350;
const AFTER_RESPONSE_MS = 1100;
const AFTER_SCRIPT_MS = 2400;
const RESTART_MS = 500;

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

  return (
    <Card className="min-h-56 justify-center gap-3 p-5 font-mono text-sm">
      {SCRIPT.slice(0, displayCount).map((line, i) =>
        line.type === "prompt" ? (
          <p key={i} className="text-muted-foreground">
            &gt; {line.text}
          </p>
        ) : (
          <p key={i} className="flex items-center gap-2 text-foreground">
            {line.success ? <Check className="size-4 shrink-0 text-chart-3" /> : null}
            {line.text}
          </p>
        )
      )}
      {isTyping ? (
        <p className="text-muted-foreground">
          &gt; {current.text.slice(0, typedChars)}
          <span className="ml-0.5 inline-block h-3.5 w-1.5 animate-pulse bg-muted-foreground align-middle" />
        </p>
      ) : null}
      {displayCount === 0 && !isTyping ? (
        <p className="text-muted-foreground">
          &gt;{" "}
          <span className="ml-0.5 inline-block h-3.5 w-1.5 animate-pulse bg-muted-foreground align-middle" />
        </p>
      ) : null}
    </Card>
  );
}
