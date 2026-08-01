import "server-only";
import path from "path";

/**
 * AI Code Health heuristic checks — ported from VibeGuard's
 * scripts/custom-checks.js. Same five checks, same regexes; only the file
 * source changed (GitHub Contents API instead of a local filesystem walk).
 */

export type FindingSeverity = "critical" | "high" | "medium";

export type Finding = {
  id: string;
  title: string;
  severity: FindingSeverity;
  file: string;
  fixPrompt: string;
};

type Check = {
  id: string;
  title: string;
  severity: FindingSeverity;
  test: (files: string[], contents: Record<string, string | null>) => string[];
  fixPrompt: (file: string) => string;
};

export const CHECKS: Check[] = [
  {
    id: "env-committed",
    title: ".env file is committed to the repo",
    severity: "critical",
    test: (files) =>
      files.filter((f) => /(^|\/)\.env($|\.)/.test(f) && !/\.env\.example$/.test(f)),
    fixPrompt: (f) =>
      `Remove ${f} from git tracking, add it to .gitignore, and rotate any secrets it contained: ` +
      `\`git rm --cached ${f}\`, then add \`${path.posix.basename(f)}\` to .gitignore and commit.`,
  },
  {
    id: "cors-wildcard",
    title: "Wildcard CORS origin ('*') found",
    severity: "high",
    test: (files, contents) =>
      files.filter((f) => {
        const c = contents[f];
        return (
          !!c &&
          /(origin\s*:\s*['"]\*['"]|Access-Control-Allow-Origin['"]?\s*[:=]\s*['"]\*['"])/i.test(c)
        );
      }),
    fixPrompt: (f) =>
      `In ${f}, replace the wildcard CORS origin with an explicit allow-list of your app's domains. ` +
      `If you're using the \`cors\` package, set \`origin: [process.env.APP_URL]\` instead of '*', ` +
      `especially if credentials/cookies are involved.`,
  },
  {
    id: "supabase-service-role-client",
    title: "Supabase service role key referenced outside a server-only file",
    severity: "critical",
    test: (files, contents) =>
      files.filter((f) => {
        const c = contents[f];
        if (!c) return false;
        const usesServiceRole = /SUPABASE_SERVICE_ROLE_KEY/.test(c);
        const looksClientSide =
          /^use client/m.test(c) || /(^|\/)(pages|app)\/(?!api\/).*\.(jsx|tsx)$/.test(f);
        return usesServiceRole && looksClientSide;
      }),
    fixPrompt: (f) =>
      `${f} references SUPABASE_SERVICE_ROLE_KEY in what looks like client-rendered code. ` +
      `Move any service-role Supabase calls into a server-only file (an API route or server action), ` +
      `and never expose that key to a 'use client' component — it bypasses Row Level Security entirely.`,
  },
  {
    id: "missing-auth-check-api-route",
    title: "API route with no visible auth check (heuristic — verify manually)",
    severity: "medium",
    test: (files, contents) =>
      files.filter((f) => {
        const isApiRoute =
          /(^|\/)(app|pages)\/api\/.*\.(js|ts)$/.test(f) || /(^|\/)api\/.*\.(js|ts)$/.test(f);
        if (!isApiRoute) return false;
        const c = contents[f];
        if (!c) return false;
        const hasAuthHint =
          /(getServerSession|auth\(\)|supabase\.auth\.getUser|requireAuth|verifyToken|withAuth|getUser\()/i.test(
            c
          );
        const touchesData = /(prisma\.|supabase\.from|db\.|\.insert\(|\.update\(|\.delete\()/i.test(c);
        return touchesData && !hasAuthHint;
      }),
    fixPrompt: (f) =>
      `${f} reads or writes data but doesn't appear to check who's calling it. ` +
      `Add an auth check at the top of the handler (e.g. verify the session/user before any DB call), ` +
      `and return 401 if there's no valid session. Flag this for manual review if it's intentionally public.`,
  },
  {
    id: "stripe-test-key-in-prod-config",
    title: "Stripe test key (sk_test_ / pk_test_) found outside .env.example",
    severity: "medium",
    test: (files, contents) =>
      files.filter((f) => {
        if (/\.env\.example$/.test(f)) return false;
        const c = contents[f];
        return !!c && /(sk|pk)_test_[A-Za-z0-9]{10,}/.test(c);
      }),
    fixPrompt: (f) =>
      `${f} contains a Stripe test key. Confirm this isn't a production deployment — ` +
      `if it is, swap in the live key via an environment variable, and make sure test keys never ship to prod.`,
  },
];

export function runChecks(files: string[], contents: Record<string, string | null>): Finding[] {
  const findings: Finding[] = [];
  for (const check of CHECKS) {
    const hits = check.test(files, contents) ?? [];
    for (const file of hits) {
      findings.push({
        id: check.id,
        title: check.title,
        severity: check.severity,
        file,
        fixPrompt: check.fixPrompt(file),
      });
    }
  }
  return findings;
}

const SEVERITY_PENALTY: Record<FindingSeverity, number> = {
  critical: 25,
  high: 15,
  medium: 8,
};

export function scoreFindings(findings: Finding[]): number {
  const penalty = findings.reduce((sum, f) => sum + SEVERITY_PENALTY[f.severity], 0);
  return Math.max(0, 100 - penalty);
}
