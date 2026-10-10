import "server-only";
import { googleDrive } from "./google-drive";
import { dropbox } from "./dropbox";
import { microsoft } from "./microsoft";
import { notionProvider } from "./notion";
import type { FileProvider, FileProviderId } from "./types";

export const PROVIDERS: Record<FileProviderId, FileProvider> = {
  GOOGLE_DRIVE: googleDrive,
  DROPBOX: dropbox,
  ONEDRIVE: microsoft,
  NOTION: notionProvider,
};

export function providerFor(id: string): FileProvider | null {
  return (PROVIDERS as Record<string, FileProvider>)[id] ?? null;
}

/** URL path segment ↔ provider id, for the connect/callback routes. */
export const PROVIDER_SLUGS: Record<string, FileProviderId> = {
  "google-drive": "GOOGLE_DRIVE",
  dropbox: "DROPBOX",
  onedrive: "ONEDRIVE",
  notion: "NOTION",
};
export const SLUG_FOR: Record<FileProviderId, string> = {
  GOOGLE_DRIVE: "google-drive",
  DROPBOX: "dropbox",
  ONEDRIVE: "onedrive",
  NOTION: "notion",
};
