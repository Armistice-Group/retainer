import "server-only";
import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";

/** Longest window any caller uses; older hits are pruned. */
const MAX_WINDOW_MS = 24 * 60 * 60 * 1000;

function hashKey(key: string) {
  return createHash("sha256").update(key).digest("hex");
}

/**
 * DB-backed sliding-window rate limit, so it holds across restarts and
 * several app processes. Records one hit for `key` and returns true when
 * there were already `limit` or more hits in the last `windowMs` (the hit
 * that's over the limit isn't recorded, so a client hammering away doesn't
 * extend its own lockout). Keys are stored hashed: put emails or IPs in them
 * freely, e.g. `share-code:ip:${ip}`.
 *
 * Count-then-insert isn't atomic, so a burst of parallel requests can go a
 * few over the limit; that's fine for throttling email sends and guesses.
 */
export async function rateLimited(key: string, limit: number, windowMs: number): Promise<boolean> {
  const k = hashKey(key);
  const now = Date.now();
  const recent = await prisma.rateLimitHit.count({
    where: { key: k, createdAt: { gte: new Date(now - windowMs) } },
  });
  if (recent >= limit) return true;
  await prisma.rateLimitHit.create({ data: { key: k } });
  // Prune now and then rather than on a schedule.
  if (Math.random() < 0.02) {
    await prisma.rateLimitHit
      .deleteMany({ where: { createdAt: { lt: new Date(now - MAX_WINDOW_MS) } } })
      .catch(() => {});
  }
  return false;
}

/** The caller's IP as the reverse proxy reports it, or null. */
export function requestIp(h: Headers): string | null {
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null;
}
