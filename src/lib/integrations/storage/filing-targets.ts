import "server-only";
import { api } from "./http";
import { ProviderError } from "./types";

// Writing files into an org's filing folder. Google Drive is id-based (and
// with the drive.file scope can only write inside folders it created, so it
// creates the root itself); Dropbox and OneDrive are path-based.

export type FilingProviderId = "GOOGLE_DRIVE" | "DROPBOX" | "ONEDRIVE";
export const FILING_PROVIDERS: FilingProviderId[] = ["GOOGLE_DRIVE", "DROPBOX", "ONEDRIVE"];

export type FilingTarget = {
  /** Creates (or finds) the root folder; returns its id/path and a URL. */
  prepareRoot(token: string, name: string): Promise<{ rootId: string; url: string | null }>;
  /** Writes a file at root/folders.../fileName, replacing `existingId` if given. */
  putFile(
    token: string,
    rootId: string,
    folders: string[],
    file: { name: string; bytes: Uint8Array; contentType: string; existingId?: string | null }
  ): Promise<{ id: string; url: string | null }>;
};

/** Safe for every service's file and folder names. */
export function safeName(name: string) {
  return (
    name
      // Path separators become dashes; characters no service allows go.
      .replace(/\s*[\\/:]+\s*/g, "-")
      .replace(/["*?<>|#%\u0000-\u001f]/g, "")
      .replace(/\s+/g, " ")
      .replace(/^[\s.]+|[\s.]+$/g, "")
      .slice(0, 120) || "Untitled"
  );
}

// ── Google Drive ─────────────────────────────────────────────────────────

const FOLDER = "application/vnd.google-apps.folder";
const DRIVE = "https://www.googleapis.com/drive/v3";
const quote = (s: string) => `'${s.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;

async function driveFolder(token: string, parent: string | null, name: string) {
  const q = [`mimeType = '${FOLDER}'`, "trashed = false", `name = ${quote(name)}`, parent ? `${quote(parent)} in parents` : "'root' in parents"];
  const found = await api<{ files: { id: string; webViewLink?: string }[] }>(
    `${DRIVE}/files?q=${encodeURIComponent(q.join(" and "))}&fields=files(id,webViewLink)&supportsAllDrives=true&includeItemsFromAllDrives=true`,
    { token }
  );
  if (found?.files?.[0]) return found.files[0];
  const made = await api<{ id: string; webViewLink?: string }>(`${DRIVE}/files?fields=id,webViewLink&supportsAllDrives=true`, {
    method: "POST",
    token,
    json: { name, mimeType: FOLDER, ...(parent ? { parents: [parent] } : {}) },
  });
  if (!made) throw new ProviderError("Google Drive didn't create the folder.");
  return made;
}

function multipart(meta: object, file: { bytes: Uint8Array; contentType: string }) {
  const boundary = `consultainer${crypto.randomUUID().replace(/-/g, "")}`;
  const head = Buffer.from(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${boundary}\r\nContent-Type: ${file.contentType}\r\n\r\n`
  );
  const tail = Buffer.from(`\r\n--${boundary}--`);
  return { body: Buffer.concat([head, Buffer.from(file.bytes), tail]), type: `multipart/related; boundary=${boundary}` };
}

const googleTarget: FilingTarget = {
  async prepareRoot(token, name) {
    const folder = await driveFolder(token, null, safeName(name));
    return { rootId: folder.id, url: folder.webViewLink ?? `https://drive.google.com/drive/folders/${folder.id}` };
  },
  async putFile(token, rootId, folders, file) {
    let parent = rootId;
    for (const f of folders) parent = (await driveFolder(token, parent, safeName(f))).id;
    const name = safeName(file.name);
    const { body, type } = multipart(file.existingId ? { name } : { name, parents: [parent] }, file);
    const url = file.existingId
      ? `https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(file.existingId)}?uploadType=multipart&fields=id,webViewLink&supportsAllDrives=true`
      : `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink&supportsAllDrives=true`;
    const res = await fetch(url, {
      method: file.existingId ? "PATCH" : "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": type },
      body,
      signal: AbortSignal.timeout(60_000),
    });
    if (res.status === 404 && file.existingId) {
      // The filed copy was deleted in Drive: file a fresh one.
      return googleTarget.putFile(token, rootId, folders, { ...file, existingId: null });
    }
    if (!res.ok) throw new ProviderError(`Google Drive upload failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
    const made = (await res.json()) as { id: string; webViewLink?: string };
    return { id: made.id, url: made.webViewLink ?? null };
  },
};

// ── Dropbox ──────────────────────────────────────────────────────────────

const dropboxPath = (root: string, folders: string[], name: string) =>
  [root.replace(/\/+$/, ""), ...folders.map(safeName), safeName(name)].join("/");

const dropboxTarget: FilingTarget = {
  async prepareRoot(token, name) {
    const path = `/${safeName(name)}`;
    try {
      await api(`https://api.dropboxapi.com/2/files/create_folder_v2`, { method: "POST", token, json: { path, autorename: false } });
    } catch (err) {
      if (!(err instanceof ProviderError) || !err.message.includes("path/conflict")) throw err;
    }
    return { rootId: path, url: `https://www.dropbox.com/home${encodeURI(path)}` };
  },
  async putFile(token, rootId, folders, file) {
    const path = dropboxPath(rootId, folders, file.name);
    const res = await fetch("https://content.dropboxapi.com/2/files/upload", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/octet-stream",
        // Header values must be ASCII; Dropbox accepts JSON with \u escapes.
        "Dropbox-API-Arg": JSON.stringify({ path, mode: "overwrite", autorename: false, mute: true }).replace(
          /[\u007f-￿]/g,
          (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`
        ),
      },
      body: Buffer.from(file.bytes),
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) throw new ProviderError(`Dropbox upload failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
    const made = (await res.json()) as { id: string; path_display?: string };
    const folder = (made.path_display ?? path).split("/").slice(0, -1).join("/");
    return { id: made.id, url: `https://www.dropbox.com/home${encodeURI(folder)}` };
  },
};

// ── OneDrive / SharePoint (the connecting person's OneDrive) ──────────────

const GRAPH = "https://graph.microsoft.com/v1.0/me/drive/root";
const graphPath = (parts: string[]) => parts.map((p) => encodeURIComponent(p)).join("/");
const SIMPLE_MAX = 4 * 1024 * 1024;
const CHUNK = 320 * 1024 * 10;

const oneDriveTarget: FilingTarget = {
  async prepareRoot(token, name) {
    const folderName = safeName(name);
    const existing = await api<{ id: string; webUrl: string }>(`${GRAPH}:/${graphPath([folderName])}`, { token }, { nullOn: [404] });
    if (existing) return { rootId: folderName, url: existing.webUrl };
    const made = await api<{ id: string; webUrl: string }>(`${GRAPH}/children`, {
      method: "POST",
      token,
      json: { name: folderName, folder: {}, "@microsoft.graph.conflictBehavior": "fail" },
    });
    return { rootId: folderName, url: made?.webUrl ?? null };
  },
  async putFile(token, rootId, folders, file) {
    const path = graphPath([rootId, ...folders.map(safeName), safeName(file.name)]);
    if (file.bytes.length <= SIMPLE_MAX) {
      const res = await fetch(`${GRAPH}:/${path}:/content`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": file.contentType },
        body: Buffer.from(file.bytes),
        signal: AbortSignal.timeout(60_000),
      });
      if (!res.ok) throw new ProviderError(`OneDrive upload failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
      const made = (await res.json()) as { id: string; webUrl?: string };
      return { id: made.id, url: made.webUrl ?? null };
    }
    const session = await api<{ uploadUrl: string }>(`${GRAPH}:/${path}:/createUploadSession`, {
      method: "POST",
      token,
      json: { item: { "@microsoft.graph.conflictBehavior": "replace" } },
    });
    if (!session) throw new ProviderError("OneDrive didn't start the upload.");
    let last: { id: string; webUrl?: string } | null = null;
    for (let start = 0; start < file.bytes.length; start += CHUNK) {
      const end = Math.min(start + CHUNK, file.bytes.length);
      const res = await fetch(session.uploadUrl, {
        method: "PUT",
        headers: { "Content-Range": `bytes ${start}-${end - 1}/${file.bytes.length}` },
        body: Buffer.from(file.bytes.subarray(start, end)),
        signal: AbortSignal.timeout(60_000),
      });
      if (!res.ok) throw new ProviderError(`OneDrive upload failed (${res.status}).`);
      if (res.status === 200 || res.status === 201) last = (await res.json()) as { id: string; webUrl?: string };
    }
    if (!last) throw new ProviderError("OneDrive didn't finish the upload.");
    return { id: last.id, url: last.webUrl ?? null };
  },
};

export const FILING_TARGETS: Record<FilingProviderId, FilingTarget> = {
  GOOGLE_DRIVE: googleTarget,
  DROPBOX: dropboxTarget,
  ONEDRIVE: oneDriveTarget,
};
