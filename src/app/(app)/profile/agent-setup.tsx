"use client";

import { useState } from "react";
import { CopyButton } from "@/components/copy-button";
import { cn } from "@/lib/utils";

const CLIENTS = ["Claude Code", "Cursor", "Claude Desktop", "Other"] as const;
type AgentClient = (typeof CLIENTS)[number];

function snippet(client: AgentClient, url: string, key: string) {
  switch (client) {
    case "Claude Code":
      return `claude mcp add --transport http consultainer ${url} \\\n  --header "Authorization: Bearer ${key}"`;
    case "Cursor":
      return JSON.stringify(
        { mcpServers: { consultainer: { url, headers: { Authorization: `Bearer ${key}` } } } },
        null,
        2,
      );
    case "Claude Desktop":
      // Desktop's local config only speaks stdio, so bridge with mcp-remote;
      // the token goes through an env var so the space in "Bearer …" survives.
      return JSON.stringify(
        {
          mcpServers: {
            consultainer: {
              command: "npx",
              args: ["-y", "mcp-remote", url, "--header", "Authorization:${CONSULTAINER_AUTH}"],
              env: { CONSULTAINER_AUTH: `Bearer ${key}` },
            },
          },
        },
        null,
        2,
      );
    case "Other":
      return `URL:     ${url}\nHeader:  Authorization: Bearer ${key}\nTransport: Streamable HTTP`;
  }
}

const WHERE: Record<AgentClient, string> = {
  "Claude Code":
    "Run in a terminal. Then ask Claude things like “log 2h on the Fleet project” or “what's unbilled this month?”",
  Cursor:
    "Add to ~/.cursor/mcp.json (or .cursor/mcp.json in a project), then enable it under Settings → MCP.",
  "Claude Desktop":
    "Add to claude_desktop_config.json (Settings → Developer → Edit Config), then restart Claude Desktop. Needs Node.js.",
  Other: "Any MCP client that supports remote servers over HTTP with a custom header.",
};

/** Copy-paste setup for connecting an AI agent to this instance's MCP
 * server. Pre-filled with a freshly created key when there is one. */
export function AgentSetup({ mcpUrl, apiKey }: { mcpUrl: string; apiKey: string | null }) {
  const [client, setClient] = useState<AgentClient>("Claude Code");
  const key = apiKey ?? "<your API key>";
  const text = snippet(client, mcpUrl, key);

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border p-4">
      <div>
        <p className="text-sm font-medium">Connect an AI agent</p>
        <p className="text-xs text-muted-foreground">
          {apiKey
            ? "Pre-filled with the key you just created."
            : "Create a key above, then paste it in place of <your API key>."}
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1" role="tablist">
          {CLIENTS.map((c) => (
            <button
              key={c}
              type="button"
              role="tab"
              aria-selected={client === c}
              onClick={() => setClient(c)}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                client === c
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {c}
            </button>
          ))}
        </div>
        <CopyButton value={text.replace(/\\\n\s*/g, "")} label="Copy" />
      </div>
      <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs leading-relaxed">{text}</pre>
      <p className="text-xs text-muted-foreground">{WHERE[client]}</p>
      <p className="text-xs text-muted-foreground">
        Behind an authenticating reverse proxy? Let <code>/api/mcp</code> through without it — the
        API key is the authentication.
      </p>
    </div>
  );
}
