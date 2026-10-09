"use client";

import { useEffect } from "react";

export function SeenBeacon({ token }: { token: string }) {
  useEffect(() => {
    fetch(`/i/${token}/seen`, { method: "POST", keepalive: true }).catch(() => {});
  }, [token]);
  return null;
}
