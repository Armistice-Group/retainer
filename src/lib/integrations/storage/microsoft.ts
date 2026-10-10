import "server-only";
import { getConfigs } from "@/lib/instance-config";
import { api, tokenRequest } from "./http";
import { ProviderError, type FileProvider, type PickerItem } from "./types";

// OneDrive and SharePoint via Microsoft Graph. Works with personal Microsoft
// accounts and work/school (Entra ID) accounts; set a tenant ID to limit it
// to one organization.
const SCOPES = ["openid", "email", "profile", "offline_access", "User.Read", "Files.ReadWrite.All", "Sites.Read.All"];
const GRAPH = "https://graph.microsoft.com/v1.0";

async function creds() {
  const c = await getConfigs(["MICROSOFT_CLIENT_ID", "MICROSOFT_CLIENT_SECRET", "MICROSOFT_TENANT_ID"]);
  if (!c.MICROSOFT_CLIENT_ID || !c.MICROSOFT_CLIENT_SECRET) {
    throw new ProviderError("OneDrive isn't set up on this instance.");
  }
  return { id: c.MICROSOFT_CLIENT_ID, secret: c.MICROSOFT_CLIENT_SECRET, tenant: c.MICROSOFT_TENANT_ID || "common" };
}

const authority = (tenant: string) => `https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0`;

type DriveItem = {
  id: string;
  name: string;
  webUrl: string;
  lastModifiedDateTime?: string;
  size?: number;
  folder?: unknown;
  file?: { mimeType?: string };
  parentReference?: { driveId?: string; path?: string; name?: string };
  remoteItem?: DriveItem;
};

/** Graph's "sharing token" for a share URL: u! + unpadded base64url. */
export function shareToken(url: string) {
  return `u!${Buffer.from(url).toString("base64url").replace(/=+$/, "")}`;
}

function toItem(raw: DriveItem): PickerItem {
  const item = raw.remoteItem ? { ...raw.remoteItem, name: raw.name ?? raw.remoteItem.name } : raw;
  return {
    id: item.id,
    title: item.name,
    url: item.webUrl,
    kind: item.folder ? "folder" : "file",
    modifiedAt: item.lastModifiedDateTime ?? null,
    location: item.parentReference?.path?.replace(/^\/drive\/root:?/, "") || item.parentReference?.name || null,
  };
}

export const microsoft: FileProvider = {
  id: "ONEDRIVE",
  label: "OneDrive & SharePoint",

  async configured() {
    const c = await getConfigs(["MICROSOFT_CLIENT_ID", "MICROSOFT_CLIENT_SECRET"]);
    return !!c.MICROSOFT_CLIENT_ID && !!c.MICROSOFT_CLIENT_SECRET;
  },

  async authorizeUrl(state, redirectUri) {
    const c = await creds();
    const url = new URL(`${authority(c.tenant)}/authorize`);
    url.searchParams.set("client_id", c.id);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("response_mode", "query");
    url.searchParams.set("scope", SCOPES.join(" "));
    url.searchParams.set("state", state);
    return url.toString();
  },

  async exchangeCode(code, redirectUri) {
    const c = await creds();
    return tokenRequest(
      `${authority(c.tenant)}/token`,
      { code, redirect_uri: redirectUri, grant_type: "authorization_code", scope: SCOPES.join(" ") },
      c
    );
  },

  async refresh(refreshToken) {
    const c = await creds();
    const t = await tokenRequest(
      `${authority(c.tenant)}/token`,
      { refresh_token: refreshToken, grant_type: "refresh_token", scope: SCOPES.join(" ") },
      c
    );
    return { ...t, refreshToken: t.refreshToken ?? refreshToken };
  },

  async account(token) {
    const me = await api<{ mail?: string; userPrincipalName?: string; displayName?: string }>(`${GRAPH}/me`, {
      token,
    });
    return { email: me?.mail ?? me?.userPrincipalName ?? null, name: me?.displayName ?? null };
  },

  async lookup(token, link) {
    const item = await api<DriveItem>(
      `${GRAPH}/shares/${shareToken(link.url)}/driveItem?$select=id,name,webUrl,lastModifiedDateTime,size,folder,file,parentReference`,
      { token, headers: { Prefer: "redeemSharingLinkIfNecessary" } },
      { nullOn: [400, 403, 404] }
    );
    if (!item) return null;
    return {
      title: item.name,
      kind: item.folder ? "folder" : "file",
      externalId: item.parentReference?.driveId ? `${item.parentReference.driveId}!${item.id}` : item.id,
      contentType: item.file?.mimeType ?? null,
      sizeBytes: item.size ?? null,
      modifiedAt: item.lastModifiedDateTime ? new Date(item.lastModifiedDateTime) : null,
      url: item.webUrl,
    };
  },

  async search(token, query) {
    const q = query.trim().replace(/'/g, "''");
    const url = q
      ? `${GRAPH}/me/drive/root/search(q='${encodeURIComponent(q)}')?$top=25`
      : `${GRAPH}/me/drive/recent?$top=25`;
    const res = await api<{ value: DriveItem[] }>(url, { token });
    return (res?.value ?? []).map(toItem).filter((i) => i.url);
  },
};
