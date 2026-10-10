import "server-only";
import { getConfigs } from "@/lib/instance-config";
import { api, tokenRequest } from "./http";
import { ProviderError, type FileProvider, type PickerItem } from "./types";

// Notion via its public OAuth integration. During connect, the person picks
// which pages the integration may see; only those are searchable here.
const API = "https://api.notion.com/v1";
const VERSION = "2022-06-28";

async function creds() {
  const c = await getConfigs(["NOTION_CLIENT_ID", "NOTION_CLIENT_SECRET"]);
  if (!c.NOTION_CLIENT_ID || !c.NOTION_CLIENT_SECRET) {
    throw new ProviderError("Notion isn't set up on this instance.");
  }
  return { id: c.NOTION_CLIENT_ID, secret: c.NOTION_CLIENT_SECRET, basic: true, json: true };
}

type RichText = { plain_text?: string }[];
type NotionObject = {
  object: "page" | "database";
  id: string;
  url: string;
  last_edited_time?: string;
  title?: RichText;
  properties?: Record<string, { type: string; title?: RichText }>;
  icon?: { type: string; emoji?: string } | null;
};

const notion = <T,>(path: string, token: string, init: RequestInit & { json?: unknown } = {}, nullOn?: number[]) =>
  api<T>(`${API}${path}`, { ...init, token, headers: { "Notion-Version": VERSION } }, { nullOn });

export function notionTitle(o: NotionObject) {
  const parts =
    o.object === "database"
      ? o.title
      : Object.values(o.properties ?? {}).find((p) => p.type === "title")?.title;
  const text = (parts ?? []).map((t) => t.plain_text ?? "").join("").trim();
  const emoji = o.icon?.type === "emoji" ? `${o.icon.emoji} ` : "";
  return `${emoji}${text || "Untitled"}`;
}

const dashed = (id: string) =>
  id.length === 32 ? `${id.slice(0, 8)}-${id.slice(8, 12)}-${id.slice(12, 16)}-${id.slice(16, 20)}-${id.slice(20)}` : id;

export const notionProvider: FileProvider = {
  id: "NOTION",
  label: "Notion",

  async configured() {
    const c = await getConfigs(["NOTION_CLIENT_ID", "NOTION_CLIENT_SECRET"]);
    return !!c.NOTION_CLIENT_ID && !!c.NOTION_CLIENT_SECRET;
  },

  async authorizeUrl(state, redirectUri) {
    const url = new URL(`${API}/oauth/authorize`);
    url.searchParams.set("client_id", (await creds()).id);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("owner", "user");
    url.searchParams.set("state", state);
    return url.toString();
  },

  async exchangeCode(code, redirectUri) {
    return tokenRequest(
      `${API}/oauth/token`,
      { code, redirect_uri: redirectUri, grant_type: "authorization_code" },
      await creds()
    );
  },

  async refresh(refreshToken) {
    const t = await tokenRequest(
      `${API}/oauth/token`,
      { refresh_token: refreshToken, grant_type: "refresh_token" },
      await creds()
    );
    return { ...t, refreshToken: t.refreshToken ?? refreshToken };
  },

  async account(token) {
    const me = await notion<{ name?: string; bot?: { owner?: { user?: { name?: string; person?: { email?: string } } }; workspace_name?: string } }>(
      "/users/me",
      token
    );
    const owner = me?.bot?.owner?.user;
    return {
      email: owner?.person?.email ?? null,
      name: me?.bot?.workspace_name ?? owner?.name ?? null,
    };
  },

  async lookup(token, link) {
    if (!link.externalId) return null;
    const id = dashed(link.externalId);
    const obj =
      (await notion<NotionObject>(`/pages/${id}`, token, {}, [400, 403, 404])) ??
      (await notion<NotionObject>(`/databases/${id}`, token, {}, [400, 403, 404]));
    if (!obj) return null;
    return {
      title: notionTitle(obj),
      kind: obj.object === "database" ? "database" : "page",
      externalId: obj.id,
      modifiedAt: obj.last_edited_time ? new Date(obj.last_edited_time) : null,
      url: obj.url,
    };
  },

  async search(token, query) {
    const res = await notion<{ results: NotionObject[] }>("/search", token, {
      method: "POST",
      json: {
        ...(query.trim() ? { query: query.trim() } : {}),
        page_size: 25,
        sort: { direction: "descending", timestamp: "last_edited_time" },
      },
    });
    return (res?.results ?? []).map(
      (o): PickerItem => ({
        id: o.id,
        title: notionTitle(o),
        url: o.url,
        kind: o.object === "database" ? "database" : "page",
        modifiedAt: o.last_edited_time ?? null,
      })
    );
  },
};
