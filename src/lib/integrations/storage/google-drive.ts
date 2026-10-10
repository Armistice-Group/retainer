import "server-only";
import { getConfigs } from "@/lib/instance-config";
import { api, tokenRequest } from "./http";
import { ProviderError, type FileProvider, type PickerItem } from "./types";
import type { LinkKind } from "./detect";

// Google Drive (and Docs/Sheets/Slides) via the Drive v3 API.
// Scopes: read-only access to browse and look up files, plus drive.file so
// Consultainer can create and update the files it files itself.
const SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/drive.readonly",
  "https://www.googleapis.com/auth/drive.file",
];
const FIELDS = "id,name,mimeType,modifiedTime,size,webViewLink,driveId";
const FOLDER = "application/vnd.google-apps.folder";

async function creds() {
  const c = await getConfigs(["GOOGLE_DRIVE_CLIENT_ID", "GOOGLE_DRIVE_CLIENT_SECRET"]);
  if (!c.GOOGLE_DRIVE_CLIENT_ID || !c.GOOGLE_DRIVE_CLIENT_SECRET) {
    throw new ProviderError("Google Drive isn't set up on this instance.");
  }
  return { id: c.GOOGLE_DRIVE_CLIENT_ID, secret: c.GOOGLE_DRIVE_CLIENT_SECRET };
}

type DriveFile = {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime?: string;
  size?: string;
  webViewLink?: string;
};

const kindOf = (mime: string): Exclude<LinkKind, null> => (mime === FOLDER ? "folder" : "file");

function toItem(f: DriveFile): PickerItem {
  return {
    id: f.id,
    title: f.name,
    url: f.webViewLink ?? `https://drive.google.com/open?id=${f.id}`,
    kind: kindOf(f.mimeType),
    modifiedAt: f.modifiedTime ?? null,
  };
}

export const googleDrive: FileProvider = {
  id: "GOOGLE_DRIVE",
  label: "Google Drive",

  async configured() {
    const c = await getConfigs(["GOOGLE_DRIVE_CLIENT_ID", "GOOGLE_DRIVE_CLIENT_SECRET"]);
    return !!c.GOOGLE_DRIVE_CLIENT_ID && !!c.GOOGLE_DRIVE_CLIENT_SECRET;
  },

  async authorizeUrl(state, redirectUri) {
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.searchParams.set("client_id", (await creds()).id);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", SCOPES.join(" "));
    url.searchParams.set("access_type", "offline");
    url.searchParams.set("prompt", "consent");
    url.searchParams.set("include_granted_scopes", "true");
    url.searchParams.set("state", state);
    return url.toString();
  },

  async exchangeCode(code, redirectUri) {
    return tokenRequest(
      "https://oauth2.googleapis.com/token",
      { code, redirect_uri: redirectUri, grant_type: "authorization_code" },
      await creds()
    );
  },

  async refresh(refreshToken) {
    const t = await tokenRequest(
      "https://oauth2.googleapis.com/token",
      { refresh_token: refreshToken, grant_type: "refresh_token" },
      await creds()
    );
    // Google doesn't rotate refresh tokens; keep the one we have.
    return { ...t, refreshToken: t.refreshToken ?? refreshToken };
  },

  async account(token) {
    const me = await api<{ email?: string; name?: string }>(
      "https://openidconnect.googleapis.com/v1/userinfo",
      { token }
    );
    return { email: me?.email ?? null, name: me?.name ?? null };
  },

  async lookup(token, link) {
    if (!link.externalId) return null;
    const f = await api<DriveFile>(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(link.externalId)}?fields=${FIELDS}&supportsAllDrives=true`,
      { token },
      { nullOn: [403, 404] }
    );
    if (!f) return null;
    return {
      title: f.name,
      kind: kindOf(f.mimeType),
      externalId: f.id,
      contentType: f.mimeType,
      sizeBytes: f.size ? Number(f.size) : null,
      modifiedAt: f.modifiedTime ? new Date(f.modifiedTime) : null,
      url: f.webViewLink ?? null,
    };
  },

  async search(token, query) {
    const q = ["trashed = false"];
    if (query.trim()) q.push(`name contains '${query.trim().replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`);
    const url = new URL("https://www.googleapis.com/drive/v3/files");
    url.searchParams.set("q", q.join(" and "));
    url.searchParams.set("fields", `files(${FIELDS})`);
    url.searchParams.set("pageSize", "25");
    url.searchParams.set("orderBy", query.trim() ? "folder,modifiedTime desc" : "modifiedTime desc");
    url.searchParams.set("supportsAllDrives", "true");
    url.searchParams.set("includeItemsFromAllDrives", "true");
    url.searchParams.set("corpora", "allDrives");
    const res = await api<{ files: DriveFile[] }>(url.toString(), { token });
    return (res?.files ?? []).map(toItem);
  },
};
