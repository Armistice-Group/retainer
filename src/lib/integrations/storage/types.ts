import type { LinkKind, DetectedLink } from "./detect";
import type { LinkDetails } from "./enrich";

export type FileProviderId = "GOOGLE_DRIVE" | "DROPBOX" | "ONEDRIVE" | "NOTION";
export const FILE_PROVIDERS: FileProviderId[] = ["GOOGLE_DRIVE", "DROPBOX", "ONEDRIVE", "NOTION"];

export type ProviderTokens = {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date | null;
  scope: string | null;
};

export type ProviderAccount = { email: string | null; name: string | null };

/** Something the person can pick to link. */
export type PickerItem = {
  id: string;
  title: string;
  url: string;
  kind: Exclude<LinkKind, null>;
  modifiedAt: string | null;
  /** e.g. "My Drive", a Notion workspace. */
  location?: string | null;
};

export class ProviderError extends Error {}

export type FileProvider = {
  id: FileProviderId;
  label: string;
  /** Instance credentials present (env or Settings → Integrations). */
  configured(): Promise<boolean>;
  authorizeUrl(state: string, redirectUri: string): Promise<string>;
  exchangeCode(code: string, redirectUri: string): Promise<ProviderTokens>;
  refresh(refreshToken: string): Promise<ProviderTokens>;
  account(accessToken: string): Promise<ProviderAccount>;
  /** Details for a pasted link, or null when it isn't this account's to see. */
  lookup(accessToken: string, link: DetectedLink): Promise<LinkDetails | null>;
  /** Search by name; an empty query lists recent items. */
  search(accessToken: string, query: string): Promise<PickerItem[]>;
};
