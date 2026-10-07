import "server-only";
import { timingSafeEqual } from "crypto";
import { prisma } from "@/lib/prisma";

// Once any user exists the instance is set up for good, so cache the positive
// answer — this runs on every visit to /, /login and /setup.
let setupComplete = false;

/** A fresh deployment has an empty database; the first visitor is sent to
 * /setup to create the organization and its local admin account. */
export async function isSetupComplete() {
  if (setupComplete) return true;
  const anyUser = await prisma.user.findFirst({ select: { id: true } });
  setupComplete = !!anyUser;
  return setupComplete;
}

export function markSetupComplete() {
  setupComplete = true;
}

/** Optional SETUP_TOKEN env var — when set, /setup requires it, so a freshly
 * deployed instance that's reachable from the internet can't be claimed by
 * whoever finds it first. */
export function isSetupTokenRequired() {
  return !!process.env.SETUP_TOKEN;
}

export function checkSetupToken(candidate: string) {
  const expected = process.env.SETUP_TOKEN;
  if (!expected) return true;
  const a = Buffer.from(candidate);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
