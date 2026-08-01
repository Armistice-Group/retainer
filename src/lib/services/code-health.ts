import "server-only";
import { prisma } from "@/lib/prisma";
import {
  accessTokenFor,
  getDefaultBranch,
  getFileContent,
  getRepoTree,
  GithubError,
} from "@/lib/integrations/github";
import { runChecks, scoreFindings, type Finding } from "@/lib/codeHealth/checks";

export class CodeHealthError extends Error {}

const IGNORE_DIRS = new Set([
  "node_modules",
  ".git",
  ".next",
  "dist",
  "build",
  "out",
  ".vercel",
  "coverage",
]);

const TEXT_EXT = new Set([".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs", ".env", ".yml", ".yaml", ".json"]);

const MAX_FILES = 250;
const MAX_FILE_SIZE = 300_000;
const FETCH_CONCURRENCY = 8;

function isCandidate(filePath: string) {
  const segments = filePath.split("/");
  if (segments.some((s) => IGNORE_DIRS.has(s))) return false;
  const dot = filePath.lastIndexOf(".");
  const ext = dot === -1 ? "" : filePath.slice(dot);
  return TEXT_EXT.has(ext) || filePath.includes(".env");
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>) {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

/** Fetches the repo's file tree + candidate file contents via the GitHub
 * Contents API (no local clone), runs the heuristic checks, and persists the
 * result as a new Scan row. */
export async function runRepoScan(repoId: string): Promise<{ score: number; findings: Finding[] }> {
  const repo = await prisma.repo.findUnique({ where: { id: repoId }, include: { connection: true } });
  if (!repo) throw new CodeHealthError("Repo not found.");

  const accessToken = accessTokenFor(repo.connection);

  let defaultBranch: string;
  let tree: Awaited<ReturnType<typeof getRepoTree>>;
  try {
    defaultBranch = await getDefaultBranch(accessToken, repo.githubOwner, repo.githubName);
    tree = await getRepoTree(accessToken, repo.githubOwner, repo.githubName, defaultBranch);
  } catch (err) {
    if (err instanceof GithubError) throw new CodeHealthError(err.message);
    throw err;
  }

  const candidates = tree
    .filter((e) => isCandidate(e.path) && (e.size ?? 0) <= MAX_FILE_SIZE)
    .slice(0, MAX_FILES)
    .map((e) => e.path);

  const fetched = await mapWithConcurrency(candidates, FETCH_CONCURRENCY, (filePath) =>
    getFileContent(accessToken, repo.githubOwner, repo.githubName, filePath, defaultBranch)
  );

  const contents: Record<string, string | null> = {};
  candidates.forEach((filePath, i) => {
    contents[filePath] = fetched[i];
  });

  const findings = runChecks(candidates, contents);
  const score = scoreFindings(findings);

  await prisma.scan.create({
    data: { repoId: repo.id, score, findings: findings as unknown as object },
  });

  return { score, findings };
}

export type InvoiceGateBlocker = {
  projectId: string;
  projectName: string;
  score: number;
  criticalCount: number;
};

/** Projects referenced by the invoice's line items that have gating enabled,
 * have been scanned at least once, and whose latest scan has critical
 * findings. Projects that were never scanned aren't blocked — there's
 * nothing to gate on yet. */
export async function getInvoiceGateBlockers(invoiceId: string): Promise<InvoiceGateBlocker[]> {
  const lineItems = await prisma.invoiceLineItem.findMany({
    where: { invoiceId, projectId: { not: null } },
    select: { projectId: true },
    distinct: ["projectId"],
  });
  const projectIds = lineItems.map((li) => li.projectId).filter((id): id is string => !!id);
  if (projectIds.length === 0) return [];

  const projects = await prisma.project.findMany({
    where: { id: { in: projectIds }, codeHealthGateEnabled: true },
    include: { repo: { include: { scans: { orderBy: { createdAt: "desc" }, take: 1 } } } },
  });

  const blockers: InvoiceGateBlocker[] = [];
  for (const project of projects) {
    const latest = project.repo?.scans[0];
    if (!latest) continue;
    const findings = latest.findings as unknown as Finding[];
    const criticalCount = findings.filter((f) => f.severity === "critical").length;
    if (criticalCount > 0) {
      blockers.push({ projectId: project.id, projectName: project.name, score: latest.score, criticalCount });
    }
  }
  return blockers;
}
