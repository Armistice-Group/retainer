import "server-only";
import Papa from "papaparse";
import { prisma } from "@/lib/prisma";

export class ImportError extends Error {}

const MAX_ROWS = 500;

export type ImportRowError = { row: number; message: string };

export type ImportSummary = {
  clientsCreated: number;
  clientsMatched: number;
  projectsCreated: number;
  projectsSkipped: number;
  rowErrors: ImportRowError[];
};

function normalizeBillingType(raw: string | undefined): "HOURLY" | "FLAT_FEE" | "MILESTONE" {
  const v = (raw ?? "").trim().toLowerCase();
  if (v.includes("flat")) return "FLAT_FEE";
  if (v.includes("milestone")) return "MILESTONE";
  return "HOURLY";
}

function numOrNull(raw: string | undefined) {
  if (!raw || !raw.trim()) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export type ImportContext = {
  orgId: string;
  actorId: string;
  defaultCurrency: string;
};

/**
 * Bulk-creates clients and projects from a CSV. Each row is a project (or
 * just a client, if the project name column is blank); a client name that
 * already exists in the org (case-insensitive) is matched rather than
 * duplicated, and a project name that already exists under its matched
 * client is skipped rather than duplicated — so re-running the same CSV
 * twice is safe.
 */
export async function importClientsAndProjects(
  ctx: ImportContext,
  csvText: string
): Promise<ImportSummary> {
  const parsed = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim().toLowerCase().replace(/[^a-z]/g, ""),
  });

  if (parsed.data.length === 0) {
    throw new ImportError("That CSV has no data rows.");
  }
  if (parsed.data.length > MAX_ROWS) {
    throw new ImportError(`Import is limited to ${MAX_ROWS} rows at a time.`);
  }

  const summary: ImportSummary = {
    clientsCreated: 0,
    clientsMatched: 0,
    projectsCreated: 0,
    projectsSkipped: 0,
    rowErrors: [],
  };

  const memberCount = await prisma.membership.count({ where: { orgId: ctx.orgId } });
  const soloOrg = memberCount === 1;

  const clientCache = new Map<string, string>();

  for (let i = 0; i < parsed.data.length; i++) {
    const rowNum = i + 2; // header is row 1
    const raw = parsed.data[i];
    const clientName = (raw.clientname || raw.client || "").trim();
    if (!clientName) {
      summary.rowErrors.push({ row: rowNum, message: "Missing client name — row skipped." });
      continue;
    }

    const cacheKey = clientName.toLowerCase();
    let clientId = clientCache.get(cacheKey);

    if (!clientId) {
      const existing = await prisma.client.findFirst({
        where: { orgId: ctx.orgId, name: { equals: clientName, mode: "insensitive" } },
      });
      if (existing) {
        clientId = existing.id;
        summary.clientsMatched++;
      } else {
        const created = await prisma.client.create({
          data: {
            orgId: ctx.orgId,
            name: clientName,
            email: raw.clientemail || null,
            website: raw.clientwebsite || null,
          },
        });
        clientId = created.id;
        summary.clientsCreated++;
      }
      clientCache.set(cacheKey, clientId);
    }

    const projectName = (raw.projectname || raw.project || "").trim();
    if (!projectName) continue;

    const existingProject = await prisma.project.findFirst({
      where: { orgId: ctx.orgId, clientId, name: { equals: projectName, mode: "insensitive" } },
    });
    if (existingProject) {
      summary.projectsSkipped++;
      continue;
    }

    const billingType = normalizeBillingType(raw.billingtype);

    const project = await prisma.project.create({
      data: {
        orgId: ctx.orgId,
        clientId,
        name: projectName,
        billingType,
        flatFeeAmount: billingType === "FLAT_FEE" ? numOrNull(raw.flatfeeamount) : null,
        budgetHours: numOrNull(raw.budgethours),
      },
    });
    summary.projectsCreated++;

    if (soloOrg) {
      await prisma.projectMember.create({
        data: {
          projectId: project.id,
          userId: ctx.actorId,
          billRate: 0,
          currency: ctx.defaultCurrency,
        },
      });
    }
  }

  return summary;
}
