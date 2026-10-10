// Recognizes a pasted link to a document's home — Google Drive/Docs,
// Dropbox, OneDrive/SharePoint, Notion, Box — so it can be stored with its
// provider, id and kind (and enriched from the provider's API when the person
// has connected it). Anything else is a plain web link. Shared by the client
// (live preview while pasting) and the server.

export type LinkProvider = "GOOGLE_DRIVE" | "DROPBOX" | "ONEDRIVE" | "NOTION" | "BOX" | "LINK";
export type LinkKind = "file" | "folder" | "page" | "database" | null;

export type DetectedLink = {
  provider: LinkProvider;
  url: string;
  externalId: string | null;
  kind: LinkKind;
  /** A best guess at a title from the URL alone. */
  title: string | null;
  /** e.g. "Google Docs", "Dropbox" */
  label: string;
};

export const PROVIDER_LABELS: Record<LinkProvider, string> = {
  GOOGLE_DRIVE: "Google Drive",
  DROPBOX: "Dropbox",
  ONEDRIVE: "OneDrive",
  NOTION: "Notion",
  BOX: "Box",
  LINK: "Link",
};

const GOOGLE_APPS: Record<string, string> = {
  document: "Google Docs",
  spreadsheets: "Google Sheets",
  presentation: "Google Slides",
  forms: "Google Forms",
  drawings: "Google Drawings",
};

function decode(s: string) {
  try {
    return decodeURIComponent(s.replace(/\+/g, " "));
  } catch {
    return s;
  }
}

/** Parses a URL into provider/id/kind. Returns null for something that
 * isn't an http(s) URL at all. */
export function detectLink(raw: string): DetectedLink | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const host = url.hostname.toLowerCase();
  const path = url.pathname;
  const base = { url: url.toString() };

  // Google Docs/Sheets/Slides: docs.google.com/<app>/d/<id>/...
  if (host === "docs.google.com") {
    const m = path.match(/^\/(document|spreadsheets|presentation|forms|drawings)\/(?:u\/\d+\/)?d\/(?:e\/)?([\w-]{10,})/);
    if (m) {
      return { ...base, provider: "GOOGLE_DRIVE", externalId: m[2], kind: "file", title: null, label: GOOGLE_APPS[m[1]] };
    }
  }
  if (host === "drive.google.com") {
    const file = path.match(/\/file\/d\/([\w-]{10,})/) ?? null;
    if (file) return { ...base, provider: "GOOGLE_DRIVE", externalId: file[1], kind: "file", title: null, label: "Google Drive" };
    const folder = path.match(/\/folders\/([\w-]{10,})/);
    if (folder) return { ...base, provider: "GOOGLE_DRIVE", externalId: folder[1], kind: "folder", title: null, label: "Google Drive" };
    const id = url.searchParams.get("id");
    if (id) return { ...base, provider: "GOOGLE_DRIVE", externalId: id, kind: "file", title: null, label: "Google Drive" };
    return { ...base, provider: "GOOGLE_DRIVE", externalId: null, kind: null, title: null, label: "Google Drive" };
  }

  // Dropbox shared links: /scl/fi/<id>/<name>, /scl/fo/<id>/<name>, /s/<id>/<name>, /sh/<id>/...
  if (host === "www.dropbox.com" || host === "dropbox.com") {
    const segments = path.split("/").filter(Boolean);
    const kind: LinkKind =
      segments[0] === "scl" ? (segments[1] === "fo" ? "folder" : "file") : segments[0] === "sh" ? "folder" : "file";
    const name = segments.at(-1);
    return {
      ...base,
      provider: "DROPBOX",
      // Dropbox resolves its own shared links; the URL is the handle.
      externalId: null,
      kind,
      title: name && /\.[a-z0-9]{1,6}$/i.test(name) ? decode(name) : null,
      label: "Dropbox",
    };
  }

  // OneDrive personal (onedrive.live.com, 1drv.ms) and SharePoint/OneDrive for Business.
  if (host === "onedrive.live.com" || host === "1drv.ms" || host.endsWith(".sharepoint.com")) {
    const name = path.split("/").filter(Boolean).at(-1);
    return {
      ...base,
      provider: "ONEDRIVE",
      externalId: null,
      kind: path.includes("/:f:/") ? "folder" : path.includes("/Forms/") ? "folder" : "file",
      title: name && /\.[a-z0-9]{2,5}$/i.test(name) ? decode(name) : null,
      label: host.endsWith(".sharepoint.com") ? "SharePoint" : "OneDrive",
    };
  }

  // Notion: the page/database id is the trailing 32 hex chars of the slug.
  if (host === "www.notion.so" || host === "notion.so" || host.endsWith(".notion.site")) {
    const m = path.match(/([0-9a-f]{32})(?:$|[/?#])/i) ?? path.match(/-([0-9a-f]{32})$/i);
    const slug = path.split("/").filter(Boolean).at(-1) ?? "";
    const title = slug.replace(/-?[0-9a-f]{32}$/i, "").replace(/-/g, " ").trim();
    return {
      ...base,
      provider: "NOTION",
      externalId: m ? m[1].toLowerCase() : null,
      kind: url.searchParams.has("v") ? "database" : "page",
      title: title || null,
      label: "Notion",
    };
  }

  if (host === "app.box.com" || host.endsWith(".app.box.com") || host === "box.com") {
    const m = path.match(/\/(file|folder)\/(\d+)/);
    return {
      ...base,
      provider: "BOX",
      externalId: m?.[2] ?? null,
      kind: m ? (m[1] === "folder" ? "folder" : "file") : path.startsWith("/s/") ? "file" : null,
      title: null,
      label: "Box",
    };
  }

  const last = decode(path.split("/").filter(Boolean).at(-1) ?? "");
  return {
    ...base,
    provider: "LINK",
    externalId: null,
    kind: null,
    title: last && /\.[a-z0-9]{2,5}$/i.test(last) ? last : host.replace(/^www\./, ""),
    label: host.replace(/^www\./, ""),
  };
}
