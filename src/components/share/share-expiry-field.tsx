"use client";

import { useState } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";

const selectClass = "h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm";

/** "Expires" on the generate/regenerate forms of client and project links:
 * never, 7/30/90 days, or a date (the link works through that day, UTC). */
export function ShareExpiryField({ id }: { id: string }) {
  const [choice, setChoice] = useState("never");
  const [tomorrow] = useState(() => new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10));
  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${id}-expires`} className="text-xs">
          Expires
        </Label>
        <select
          id={`${id}-expires`}
          name="expires"
          value={choice}
          onChange={(e) => setChoice(e.target.value)}
          className={selectClass}
        >
          <option value="never">Never</option>
          <option value="7">In 7 days</option>
          <option value="30">In 30 days</option>
          <option value="90">In 90 days</option>
          <option value="custom">On a date…</option>
        </select>
      </div>
      {choice === "custom" ? (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${id}-expires-on`} className="text-xs">
            Last day
          </Label>
          <Input
            id={`${id}-expires-on`}
            name="expiresOn"
            type="date"
            min={tomorrow}
            required
            className="w-auto"
          />
        </div>
      ) : null}
    </div>
  );
}
