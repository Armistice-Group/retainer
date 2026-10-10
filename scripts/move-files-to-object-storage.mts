// Moves files stored in the database (client documents, expense receipts,
// milestone evidence) into the S3-compatible bucket configured with S3_*,
// then clears the database copies. Safe to re-run; only touches files that
// are still in the database. Usage (in the app container):
//
//   docker compose exec consultainer-app node_modules/.bin/tsx scripts/move-files-to-object-storage.mts
//   (add --dry-run to just count)
import { randomUUID } from "node:crypto";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

const dryRun = process.argv.includes("--dry-run");
const bucket = process.env.S3_BUCKET;
if (!bucket) {
  console.error("Set S3_BUCKET (and S3_* credentials) first.");
  process.exit(1);
}
const prefix = process.env.S3_PREFIX ?? "";
const s3 = new S3Client({
  region: process.env.S3_REGION || "us-east-1",
  endpoint: process.env.S3_ENDPOINT || undefined,
  forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
  credentials:
    process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY
      ? { accessKeyId: process.env.S3_ACCESS_KEY_ID, secretAccessKey: process.env.S3_SECRET_ACCESS_KEY }
      : undefined,
});
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

const safe = (name: string) => name.replace(/[^\w.-]+/g, "_").slice(-100);
async function put(key: string, body: Uint8Array, contentType: string | null) {
  await s3.send(
    new PutObjectCommand({ Bucket: bucket, Key: `${prefix}${key}`, Body: body, ContentType: contentType ?? "application/octet-stream" })
  );
}

let moved = 0;
const docs = await prisma.clientDocument.findMany({
  where: { fileData: { not: null } },
  select: { id: true, fileName: true, contentType: true, client: { select: { orgId: true } } },
});
const receipts = await prisma.expense.findMany({
  where: { receiptFileData: { not: null } },
  select: { id: true, orgId: true, receiptFileName: true, receiptContentType: true },
});
const evidence = await prisma.milestone.findMany({
  where: { completionFileData: { not: null } },
  select: { id: true, completionFileName: true, completionFileContentType: true, project: { select: { orgId: true } } },
});
console.log(`In the database: ${docs.length} documents, ${receipts.length} receipts, ${evidence.length} evidence files.`);
if (dryRun) process.exit(0);

for (const d of docs) {
  const row = await prisma.clientDocument.findUniqueOrThrow({ where: { id: d.id }, select: { fileData: true } });
  const key = `orgs/${d.client.orgId}/documents/${randomUUID()}-${safe(d.fileName)}`;
  await put(key, row.fileData!, d.contentType);
  await prisma.clientDocument.update({ where: { id: d.id }, data: { storageKey: key, fileData: null } });
  moved++;
}
for (const r of receipts) {
  const row = await prisma.expense.findUniqueOrThrow({ where: { id: r.id }, select: { receiptFileData: true } });
  const key = `orgs/${r.orgId}/receipts/${randomUUID()}-${safe(r.receiptFileName ?? "receipt")}`;
  await put(key, row.receiptFileData!, r.receiptContentType);
  await prisma.expense.update({ where: { id: r.id }, data: { receiptStorageKey: key, receiptFileData: null } });
  moved++;
}
for (const m of evidence) {
  const row = await prisma.milestone.findUniqueOrThrow({ where: { id: m.id }, select: { completionFileData: true } });
  const key = `orgs/${m.project.orgId}/milestones/${randomUUID()}-${safe(m.completionFileName ?? "evidence")}`;
  await put(key, row.completionFileData!, m.completionFileContentType);
  await prisma.milestone.update({ where: { id: m.id }, data: { completionStorageKey: key, completionFileData: null } });
  moved++;
}
console.log(`Moved ${moved} files to ${bucket}.`);
await prisma.$disconnect();
