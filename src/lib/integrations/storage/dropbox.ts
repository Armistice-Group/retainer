import "server-only";
import { getConfigs } from "@/lib/instance-config";
import { api, tokenRequest } from "./http";
import { ProviderError, type FileProvider, type PickerItem } from "./types";

// Dropbox via the v2 API. Shared links are how Dropbox items are addressed
// from outside, so picking an item makes (or reuses) a shared link for it.
const SCOPES = [
  "account_info.read",
  "files.metadata.read",
  "files.content.read",
  "files.content.write",
  "sharing.read",
  "sharing.write",
];

async function creds() {
  const c = await getConfigs(["DROPBOX_APP_KEY", "DROPBOX_APP_SECRET"]);
  if (!c.DROPBOX_APP_KEY || !c.DROPBOX_APP_SECRET) {
    throw new ProviderError("Dropbox isn't set up on this instance.");
  }
  return { id: c.DROPBOX_APP_KEY, secret: c.DROPBOX_APP_SECRET };
}

type Metadata = {
  ".tag": "file" | "folder" | "deleted";
  id?: string;
  name: string;
  path_display?: string;
  path_lower?: string;
  server_modified?: string;
  size?: number;
  url?: string;
};

const RPC = "https://api.dropboxapi.com/2";

/** A shared link to a path: an existing one if there is, else a new one. */
async function sharedLink(token: string, path: string): Promise<string | null> {
  const existing = await api<{ links: { url: string }[] }>(`${RPC}/sharing/list_shared_links`, {
    method: "POST",
    token,
    json: { path, direct_only: true },
  });
  if (existing?.links?.[0]) return existing.links[0].url;
  try {
    const made = await api<{ url: string }>(`${RPC}/sharing/create_shared_link_with_settings`, {
      method: "POST",
      token,
      json: { path },
    });
    return made?.url ?? null;
  } catch {
    return null;
  }
}

export const dropbox: FileProvider = {
  id: "DROPBOX",
  label: "Dropbox",

  async configured() {
    const c = await getConfigs(["DROPBOX_APP_KEY", "DROPBOX_APP_SECRET"]);
    return !!c.DROPBOX_APP_KEY && !!c.DROPBOX_APP_SECRET;
  },

  async authorizeUrl(state, redirectUri) {
    const url = new URL("https://www.dropbox.com/oauth2/authorize");
    url.searchParams.set("client_id", (await creds()).id);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("token_access_type", "offline");
    url.searchParams.set("scope", SCOPES.join(" "));
    url.searchParams.set("state", state);
    return url.toString();
  },

  async exchangeCode(code, redirectUri) {
    return tokenRequest(
      "https://api.dropboxapi.com/oauth2/token",
      { code, redirect_uri: redirectUri, grant_type: "authorization_code" },
      await creds()
    );
  },

  async refresh(refreshToken) {
    const t = await tokenRequest(
      "https://api.dropboxapi.com/oauth2/token",
      { refresh_token: refreshToken, grant_type: "refresh_token" },
      await creds()
    );
    return { ...t, refreshToken: t.refreshToken ?? refreshToken };
  },

  async account(token) {
    const me = await api<{ email?: string; name?: { display_name?: string } }>(
      `${RPC}/users/get_current_account`,
      { method: "POST", token }
    );
    return { email: me?.email ?? null, name: me?.name?.display_name ?? null };
  },

  async lookup(token, link) {
    let meta: Metadata | null = null;
    try {
      meta = await api<Metadata>(
        `${RPC}/sharing/get_shared_link_metadata`,
        { method: "POST", token, json: { url: link.url } },
        { nullOn: [404, 409] }
      );
    } catch {
      return null;
    }
    if (!meta) return null;
    return {
      title: meta.name,
      kind: meta[".tag"] === "folder" ? "folder" : "file",
      externalId: meta.id ?? null,
      sizeBytes: meta.size ?? null,
      modifiedAt: meta.server_modified ? new Date(meta.server_modified) : null,
      url: meta.url ?? null,
    };
  },

  async search(token, query) {
    let entries: Metadata[];
    if (query.trim()) {
      const res = await api<{ matches: { metadata: { metadata: Metadata } }[] }>(`${RPC}/files/search_v2`, {
        method: "POST",
        token,
        json: { query: query.trim(), options: { max_results: 25 } },
      });
      entries = (res?.matches ?? []).map((m) => m.metadata.metadata);
    } else {
      const res = await api<{ entries: Metadata[] }>(`${RPC}/files/list_folder`, {
        method: "POST",
        token,
        json: { path: "", limit: 25 },
      });
      entries = res?.entries ?? [];
    }
    const items: PickerItem[] = [];
    for (const e of entries.filter((x) => x[".tag"] !== "deleted").slice(0, 25)) {
      const path = e.path_lower ?? e.path_display;
      if (!path || !e.id) continue;
      items.push({
        id: e.id,
        title: e.name,
        // Resolved to a shared link when picked (see resolvePick).
        url: `dropbox:${path}`,
        kind: e[".tag"] === "folder" ? "folder" : "file",
        modifiedAt: e.server_modified ?? null,
        location: e.path_display?.split("/").slice(0, -1).join("/") || "/",
      });
    }
    return items;
  },
};

/** Turns a picked "dropbox:<path>" into a real shared link. */
export async function resolveDropboxPick(token: string, pseudoUrl: string) {
  if (!pseudoUrl.startsWith("dropbox:")) return pseudoUrl;
  const url = await sharedLink(token, pseudoUrl.slice("dropbox:".length));
  if (!url) throw new ProviderError("Dropbox wouldn't make a shared link for that item.");
  return url;
}
