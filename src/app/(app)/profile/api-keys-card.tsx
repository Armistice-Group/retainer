"use client";

import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CopyButton } from "@/components/copy-button";
import { createApiKeyAction, revokeApiKeyAction } from "@/actions/api-keys";
import { formatDate } from "@/lib/format";
import { AgentSetup } from "./agent-setup";

export type ApiKeyItem = {
  id: string;
  name: string;
  keyPrefix: string;
  createdAt: Date;
  lastUsedAt: Date | null;
};

export function ApiKeysCard({ apiKeys, mcpUrl }: { apiKeys: ApiKeyItem[]; mcpUrl: string }) {
  const [name, setName] = useState("");
  const [newKey, setNewKey] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleCreate() {
    if (!name.trim()) return;
    startTransition(async () => {
      const raw = await createApiKeyAction(name);
      setNewKey(raw);
      setName("");
    });
  }

  return (
    <Card id="api-keys">
      <CardHeader>
        <CardTitle className="text-base">API keys &amp; AI agents</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">
          Use an API key to call the Consultainer REST API or connect an AI agent (Claude, Cursor)
          over MCP. A key acts as you, in this organization.
        </p>

        {newKey ? (
          <Alert>
            <AlertDescription className="flex flex-col gap-2">
              <span>Copy this key now — you won&apos;t be able to see it again.</span>
              <div className="flex items-center gap-2">
                <code className="flex-1 truncate rounded bg-muted px-2 py-1 text-xs">{newKey}</code>
                <CopyButton value={newKey} label="Copy" />
              </div>
            </AlertDescription>
          </Alert>
        ) : null}

        <div className="flex items-end gap-2">
          <div className="flex flex-1 flex-col gap-2">
            <Label htmlFor="key-name">New key name</Label>
            <Input
              id="key-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Claude Desktop, Cursor"
            />
          </div>
          <Button onClick={handleCreate} disabled={isPending || !name.trim()}>
            Create key
          </Button>
        </div>

        {apiKeys.length > 0 ? (
          <ul className="flex flex-col divide-y divide-border">
            {apiKeys.map((key) => (
              <li key={key.id} className="flex items-center justify-between gap-2 py-2.5 text-sm">
                <div>
                  <p className="font-medium">{key.name}</p>
                  <p className="tabular-figures text-xs text-muted-foreground">
                    {key.keyPrefix}… · created {formatDate(key.createdAt)}
                    {key.lastUsedAt ? ` · last used ${formatDate(key.lastUsedAt)}` : ""}
                  </p>
                </div>
                <form action={revokeApiKeyAction.bind(null, key.id)}>
                  <Button variant="ghost" size="icon" className="size-7" type="submit">
                    <Trash2 className="size-3.5" />
                  </Button>
                </form>
              </li>
            ))}
          </ul>
        ) : null}

        <AgentSetup mcpUrl={mcpUrl} apiKey={newKey} />
      </CardContent>
    </Card>
  );
}
