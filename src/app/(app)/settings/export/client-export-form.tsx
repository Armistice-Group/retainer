"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

const selectClass = "h-8 w-full max-w-sm rounded-lg border border-input bg-transparent px-2.5 text-sm";

export function ClientExportForm({ clients }: { clients: { id: string; name: string }[] }) {
  const [clientId, setClientId] = useState("");
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor="export-client">Client</Label>
      <div className="flex flex-wrap items-center gap-2">
        <select
          id="export-client"
          className={selectClass}
          value={clientId}
          onChange={(e) => setClientId(e.target.value)}
        >
          <option value="">Choose a client…</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        {clientId ? (
          <Button asChild variant="outline">
            <a href={`/api/export/clients/${encodeURIComponent(clientId)}`} download>
              <Download className="size-3.5" /> Download ZIP
            </a>
          </Button>
        ) : (
          <Button variant="outline" disabled>
            <Download className="size-3.5" /> Download ZIP
          </Button>
        )}
      </div>
    </div>
  );
}
