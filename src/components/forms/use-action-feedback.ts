"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";

type State = { error?: string; fieldErrors?: Record<string, string[]> } | null | undefined;

/**
 * Toasts once an action finishes without an error: "Saved" by default, or
 * a message (worked out from the result, when it's a function).
 */
export function useActionFeedback<S extends State>(
  state: S,
  isPending: boolean,
  message: string | ((state: S) => string | null) = "Saved"
) {
  const wasPending = useRef(false);
  const latest = useRef(message);
  useEffect(() => {
    latest.current = message;
  });
  useEffect(() => {
    if (wasPending.current && !isPending && !state?.error && !state?.fieldErrors) {
      const text = typeof latest.current === "function" ? latest.current(state) : latest.current;
      if (text) toast.success(text);
    }
    wasPending.current = isPending;
  }, [isPending, state]);
}
