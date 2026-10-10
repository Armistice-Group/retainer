import "server-only";

// S3-compatible object storage for uploads (AWS S3, Cloudflare R2, MinIO,
// Backblaze B2...). Off unless S3_BUCKET is set; see docs/self-hosting.mdx.

export type ObjectStore = {
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Uint8Array | null>;
  delete(key: string): Promise<void>;
};

export async function objectStorage(): Promise<ObjectStore | null> {
  if (!process.env.S3_BUCKET) return null;
  // Implemented in the storage phase; until then uploads stay in the database.
  return null;
}
