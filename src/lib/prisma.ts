import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

// RDS's default parameter group requires TLS (rds.force_ssl=1), but pg
// doesn't negotiate it the way psql does — it needs an explicit ssl config.
// Verify the server cert against Amazon's public RDS CA bundle when it's
// present (bundled into the production image); local dev's Postgres has no
// TLS at all, so this is a no-op there rather than something to configure.
function getSslConfig() {
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
