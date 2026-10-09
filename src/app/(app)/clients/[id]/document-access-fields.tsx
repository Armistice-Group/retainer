"use client";

import { useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type DocumentMember = { id: string; name: string; role: string };

/** "Who can see it" for a client document; posts access + allowedUserIds. */
export function DocumentAccessFields({
  members,
  viewerId,
  defaultAccess = "EVERYONE",
  defaultAllowed = [],
  idPrefix,
}: {
  members: DocumentMember[];
  viewerId: string;
  defaultAccess?: string;
  defaultAllowed?: string[];
  idPrefix: string;
}) {
  const [access, setAccess] = useState(defaultAccess);
  // Owners always have access; the uploader too.
  const pickable = members.filter((m) => m.role !== "OWNER" && m.id !== viewerId);

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={`${idPrefix}-access`}>Who can see it</Label>
      <Select name="access" value={access} onValueChange={setAccess}>
        <SelectTrigger id={`${idPrefix}-access`} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="EVERYONE">Everyone in the organization</SelectItem>
          <SelectItem value="ADMINS">Owners & admins</SelectItem>
          <SelectItem value="SELECTED">Specific people</SelectItem>
        </SelectContent>
      </Select>
      {access === "SELECTED" ? (
        pickable.length ? (
          <ul className="flex max-h-48 flex-col gap-1.5 overflow-y-auto rounded-md border border-border p-2">
            {pickable.map((m) => (
              <li key={m.id} className="flex items-center gap-2 text-sm">
                <Checkbox
                  id={`${idPrefix}-u-${m.id}`}
                  name="allowedUserIds"
                  value={m.id}
                  defaultChecked={defaultAllowed.includes(m.id)}
                />
                <Label htmlFor={`${idPrefix}-u-${m.id}`} className="font-normal">
                  {m.name}
                  <span className="text-xs text-muted-foreground">
                    {m.role === "ADMIN" ? "Admin" : "Member"}
                  </span>
                </Label>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-muted-foreground">No one else to pick yet.</p>
        )
      ) : null}
      <p className="text-xs text-muted-foreground">
        Owners and the person who uploaded it can always see it. Opens are logged in the audit
        log.
      </p>
    </div>
  );
}
