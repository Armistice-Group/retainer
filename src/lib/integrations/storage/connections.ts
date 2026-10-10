import "server-only";
import { prisma } from "@/lib/prisma";
import { decrypt, encrypt } from "@/lib/crypto";
import { providerFor } from "./registry";
import { ProviderError, type FileProviderId, type PickerItem, type ProviderTokens } from "./types";
import type { UserConnection } from "@/generated/prisma/client";

export function tokenColumns(tokens: ProviderTokens) {
  return {
    accessToken: encrypt(tokens.accessToken),
    refreshToken: tokens.refreshToken ? encrypt(tokens.refreshToken) : null,
    expiresAt: tokens.expiresAt,
    scope: tokens.scope,
  };
}

// Serialize refreshes per connection (some providers rotate refresh tokens).
const refreshing = new Map<string, Promise<string>>();

/** A live access token, refreshed (and saved) when close to expiry. */
export async function accessTokenFor(connection: UserConnection): Promise<string> {
  const exp = connection.expiresAt?.getTime();
  if (!exp || exp - 2 * 60 * 1000 > Date.now() || !connection.refreshToken) {
    return decrypt(connection.accessToken);
  }
  let pending = refreshing.get(connection.id);
  if (!pending) {
    pending = (async () => {
      const provider = providerFor(connection.provider);
      if (!provider) throw new ProviderError("Unknown provider.");
      const latest = await prisma.userConnection.findUniqueOrThrow({ where: { id: connection.id } });
      const latestExp = latest.expiresAt?.getTime();
      if (latestExp && latestExp - 2 * 60 * 1000 > Date.now()) return decrypt(latest.accessToken);
      const tokens = await provider.refresh(decrypt(latest.refreshToken!));
      await prisma.userConnection.update({ where: { id: connection.id }, data: tokenColumns(tokens) });
      return tokens.accessToken;
    })().finally(() => refreshing.delete(connection.id));
    refreshing.set(connection.id, pending);
  }
  return pending;
}

export async function connectionFor(userId: string, provider: FileProviderId) {
  return prisma.userConnection.findUnique({ where: { userId_provider: { userId, provider } } });
}

/** Searches one of the person's connected services. */
export async function searchConnected(userId: string, provider: FileProviderId, query: string): Promise<PickerItem[]> {
  const connection = await connectionFor(userId, provider);
  if (!connection) throw new ProviderError("Connect it on your profile first.");
  const impl = providerFor(provider)!;
  return impl.search(await accessTokenFor(connection), query.slice(0, 200));
}

/** Turns a picked item into a link to store (Dropbox needs a shared link). */
export async function resolvePick(userId: string, provider: FileProviderId, url: string) {
  if (provider !== "DROPBOX" || !url.startsWith("dropbox:")) return url;
  const connection = await connectionFor(userId, provider);
  if (!connection) throw new ProviderError("Connect Dropbox on your profile first.");
  const { resolveDropboxPick } = await import("./dropbox");
  return resolveDropboxPick(await accessTokenFor(connection), url);
}
