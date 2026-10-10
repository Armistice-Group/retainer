import "server-only";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  NoSuchKey,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

// S3-compatible object storage for uploads (AWS S3, Cloudflare R2, MinIO,
// Backblaze B2, Wasabi...). Off unless S3_BUCKET is set:
//
//   S3_BUCKET              bucket name (required to turn it on)
//   S3_REGION              e.g. us-east-1 (R2: "auto"; default us-east-1)
//   S3_ENDPOINT            for anything that isn't AWS, e.g. https://<acct>.r2.cloudflarestorage.com
//   S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY
//   S3_FORCE_PATH_STYLE    "true" for MinIO and most self-hosted servers
//   S3_PREFIX              optional key prefix, e.g. "consultainer/"
//
// Files are private: the app reads them back itself and serves them behind
// its own access checks — nothing is ever made public in the bucket.

export type ObjectStore = {
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Uint8Array | null>;
  delete(key: string): Promise<void>;
  check(): Promise<void>;
};

let cached: { signature: string; store: ObjectStore } | null = null;

export async function objectStorage(): Promise<ObjectStore | null> {
  const bucket = process.env.S3_BUCKET;
  if (!bucket) return null;
  const config = {
    region: process.env.S3_REGION || "us-east-1",
    endpoint: process.env.S3_ENDPOINT || undefined,
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
    credentials:
      process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY
        ? { accessKeyId: process.env.S3_ACCESS_KEY_ID, secretAccessKey: process.env.S3_SECRET_ACCESS_KEY }
        : undefined, // fall back to the SDK's default chain (instance role, etc.)
  };
  const prefix = process.env.S3_PREFIX ?? "";
  const signature = JSON.stringify({ bucket, prefix, ...config, credentials: config.credentials?.accessKeyId });
  if (cached?.signature === signature) return cached.store;

  const client = new S3Client(config);
  const k = (key: string) => `${prefix}${key}`;
  const store: ObjectStore = {
    async put(key, body, contentType) {
      await client.send(
        new PutObjectCommand({ Bucket: bucket, Key: k(key), Body: body, ContentType: contentType })
      );
    },
    async get(key) {
      try {
        const res = await client.send(new GetObjectCommand({ Bucket: bucket, Key: k(key) }));
        return res.Body ? await res.Body.transformToByteArray() : null;
      } catch (err) {
        if (err instanceof NoSuchKey) return null;
        throw err;
      }
    },
    async delete(key) {
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: k(key) }));
    },
    async check() {
      await client.send(new HeadBucketCommand({ Bucket: bucket }));
    },
  };
  cached = { signature, store };
  return store;
}
