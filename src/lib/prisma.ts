import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

// RDS's default parameter group requires TLS (rds.force_ssl=1), but pg
// doesn't negotiate it the way psql does — it needs an explicit ssl config.
// Verify the server cert against Amazon's public RDS CA bundle when
// DATABASE_URL actually points at RDS. Gating on the hostname rather than
// just the cert file's presence matters: Next's standalone build tracer
// bundles certs/ into .next/standalone regardless of environment (it's a
// tracked repo file), so a presence-only check would try TLS against local
// dev's non-TLS Postgres too, the moment a standalone build runs locally.
function getSslConfig() {
  const databaseUrl = process.env.DATABASE_URL ?? "";
  if (!/\.rds\.amazonaws\.com/i.test(databaseUrl)) return undefined;
  const caPath = join(process.cwd(), "certs", "rds-global-bundle.pem");
  if (!existsSync(caPath)) return undefined;
  return { ca: readFileSync(caPath, "utf-8"), rejectUnauthorized: true };
}

function createPrismaClient() {
  const ssl = getSslConfig();
  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL,
    ...(ssl ? { ssl } : {}),
  });
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
