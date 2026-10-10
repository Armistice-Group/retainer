import "server-only";

// Where uploaded files' bytes live. Today: in the database row itself
// (fileData). With S3-compatible storage configured, new uploads go there and
// the row keeps only a storageKey. Reads handle both, so existing files keep
// working after storage is switched on.

export type StoredFile = { fileData: Uint8Array<ArrayBuffer> | null; storageKey: string | null };

export async function storeFile(
  bytes: Buffer,
  meta: { contentType: string; keyPrefix: string; fileName: string }
): Promise<StoredFile> {
  const { objectStorage } = await import("@/lib/object-storage");
  const store = await objectStorage();
  if (!store) return { fileData: new Uint8Array(bytes), storageKey: null };
  const safeName = meta.fileName.replace(/[^\w.-]+/g, "_").slice(-100);
  const key = `${meta.keyPrefix}/${crypto.randomUUID()}-${safeName}`;
  await store.put(key, bytes, meta.contentType);
  return { fileData: null, storageKey: key };
}

export async function readFile(file: {
  fileData: Uint8Array | null;
  storageKey: string | null;
}): Promise<Uint8Array | null> {
  if (file.fileData) return file.fileData;
  if (!file.storageKey) return null;
  const { objectStorage } = await import("@/lib/object-storage");
  const store = await objectStorage();
  if (!store) return null;
  return store.get(file.storageKey);
}

export async function deleteStoredFile(file: { storageKey: string | null }) {
  if (!file.storageKey) return;
  const { objectStorage } = await import("@/lib/object-storage");
  const store = await objectStorage();
  await store?.delete(file.storageKey).catch((err) => {
    console.warn("[storage] Couldn't delete", file.storageKey, err);
  });
}
