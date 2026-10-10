import "server-only";
import { randomBytes } from "crypto";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { recordAuditEvent } from "@/lib/audit";
import { resolveBillRate } from "@/lib/bill-rates";
import {
  DATE_FORMATS,
  IMPORT_FIELDS,
  IMPORT_KINDS,
  IMPORT_SOURCES,
  ImportFileError,
  SOURCE_LABELS,
  autoMapColumns,
  detectDateFormat,
  detectSource,
  mappingProblem,
  normalizeClientRows,
  normalizeProjectRows,
  normalizeTimeRows,
  parseCsv,
  type ColumnMapping,
  type DateFormat,
  type ImportKind,
  type ImportSource,
  type ParsedCsv,
  type RowError,
  type TimeRow,
} from "@/lib/portability/import-formats";

export class ImportError extends Error {}

export const SKIP = "skip";

export const importOptionsSchema = z.object({
  source: z.enum(IMPORT_SOURCES).optional(),
  kind: z.enum(IMPORT_KINDS).optional(),
  mapping: z.partialRecord(z.enum(IMPORT_FIELDS), z.string().max(500)).optional(),
  dateFormat: z.enum(DATE_FORMATS).optional(),
  // Rows the old tool already invoiced: imported as non-billable (default,
  // so they're never billed twice), skipped, or imported as they are.
  invoicedRows: z.enum(["nonbillable", "skip", "import"]).optional(),
  // Person in the file (TimeRow.personKey) → member's user id, or "skip".
  people: z.record(z.string().max(500), z.string().max(100)).optional(),
});
export type ImportOptions = z.infer<typeof importOptionsSchema>;

export type ImportPerson = {
  key: string;
  name: string;
  email: string | null;
  rows: number;
  hours: number;
  /** Member the rows go to: chosen, or matched by email then name. */
  userId: string | null;
  matchedBy: "email" | "name" | "chosen" | null;
};

export type ImportPreview = {
  fileName: string;
  source: ImportSource;
  kind: ImportKind;
  detected: { source: ImportSource; kind: ImportKind };
  headers: string[];
  mapping: ColumnMapping;
  /** Set when the mapping can't be used yet; nothing else is filled in. */
  mappingProblem: string | null;
  dateFormat: Exclude<DateFormat, "auto">;
  dateFormatAmbiguous: boolean;
  totalRows: number;
  errorCount: number;
  errors: RowError[];
  alreadyImported: number;
  invoicedInSource: number;
  /** Up to 200 names; newClientCount / newProjectCount are the totals. */
  newClients: string[];
  newClientCount: number;
  existingClients: number;
  newProjects: { client: string; project: string }[];
  newProjectCount: number;
  existingProjects: number;
  people: ImportPerson[];
  /** Rows that would be skipped because their person maps to nobody. */
  unassignedRows: number;
  entriesToCreate: number;
  hoursToCreate: number;
  warnings: string[];
  sample: TimeRow[];
  members: { userId: string; name: string; email: string }[];
};

const MAX_ERRORS_SHOWN = 100;
const MAX_NAMES_SHOWN = 200;
const CHUNK = 1000;

type Analysis = {
  preview: ImportPreview;
  timeRows: TimeRow[];
  /** TimeRows to create, with the member each goes to. */
  toCreate: { row: TimeRow; userId: string }[];
  clientsByKey: Map<string, string>; // lowercased name → existing id
  projectsByKey: Map<string, string>; // clientKey + "\n" + project → existing id
  projectRows: ReturnType<typeof normalizeProjectRows>["rows"];
  clientRows: ReturnType<typeof normalizeClientRows>["rows"];
};

const key = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
const projectKey = (client: string, project: string) => `${key(client)}\n${key(project)}`;

async function existingHashes(orgId: string, hashes: string[]) {
  const found = new Set<string>();
  for (let i = 0; i < hashes.length; i += 5000) {
    const records = await prisma.importRecord.findMany({
      where: { orgId, rowHash: { in: hashes.slice(i, i + 5000) } },
      select: { rowHash: true },
    });
    for (const r of records) found.add(r.rowHash);
  }
  return found;
}

async function analyze(
  orgId: string,
  parsed: ParsedCsv,
  fileName: string,
  options: ImportOptions
): Promise<Analysis> {
  const detected = detectSource(parsed.headers);
  const source = options.source ?? detected.source;
  const kind = options.kind ?? detected.kind;
  let mapping: ColumnMapping = autoMapColumns(parsed.headers, kind);
  if (options.mapping) {
    mapping = {};
    for (const [field, header] of Object.entries(options.mapping)) {
      if (header && parsed.headers.includes(header)) mapping[field as keyof ColumnMapping] = header;
    }
  }

  const [memberships, clients, projects] = await Promise.all([
    prisma.membership.findMany({
      where: { orgId },
      select: { userId: true, user: { select: { name: true, email: true } } },
      orderBy: { user: { name: "asc" } },
    }),
    prisma.client.findMany({ where: { orgId }, select: { id: true, name: true } }),
    prisma.project.findMany({
      where: { orgId },
      select: { id: true, name: true, client: { select: { name: true } } },
    }),
  ]);
  const members = memberships.map((m) => ({ userId: m.userId, name: m.user.name, email: m.user.email }));
  const clientsByKey = new Map<string, string>();
  for (const c of clients) if (!clientsByKey.has(key(c.name))) clientsByKey.set(key(c.name), c.id);
  const projectsByKey = new Map<string, string>();
  for (const p of projects) {
    const k = projectKey(p.client.name, p.name);
    if (!projectsByKey.has(k)) projectsByKey.set(k, p.id);
  }

  const preview: ImportPreview = {
    fileName,
    source,
    kind,
    detected,
    headers: parsed.headers,
    mapping,
    mappingProblem: mappingProblem(mapping, kind),
    dateFormat: "ymd",
    dateFormatAmbiguous: false,
    totalRows: parsed.rows.length,
    errorCount: 0,
    errors: [],
    alreadyImported: 0,
    invoicedInSource: 0,
    newClients: [],
    newClientCount: 0,
    existingClients: 0,
    newProjects: [],
    newProjectCount: 0,
    existingProjects: 0,
    people: [],
    unassignedRows: 0,
    entriesToCreate: 0,
    hoursToCreate: 0,
    warnings: [],
    sample: [],
    members,
  };
  const analysis: Analysis = {
    preview,
    timeRows: [],
    toCreate: [],
    clientsByKey,
    projectsByKey,
    projectRows: [],
    clientRows: [],
  };
  if (preview.mappingProblem) return analysis;

  const newClients = new Map<string, string>();
  const matchedClients = new Set<string>();
  const noteClient = (name: string) => {
    const k = key(name);
    if (clientsByKey.has(k)) matchedClients.add(k);
    else if (!newClients.has(k)) newClients.set(k, name);
  };
  const newProjects = new Map<string, { client: string; project: string }>();
  const matchedProjects = new Set<string>();
  const noteProject = (client: string, project: string) => {
    const k = projectKey(client, project);
    if (projectsByKey.has(k)) matchedProjects.add(k);
    else if (!newProjects.has(k)) newProjects.set(k, { client, project });
  };
  const setErrors = (errors: RowError[]) => {
    preview.errorCount = errors.length;
    preview.errors = errors.slice(0, MAX_ERRORS_SHOWN);
  };
  const finish = () => {
    preview.newClients = [...newClients.values()].slice(0, MAX_NAMES_SHOWN);
    preview.existingClients = matchedClients.size;
    preview.newProjects = [...newProjects.values()].slice(0, MAX_NAMES_SHOWN);
    preview.existingProjects = matchedProjects.size;
    if (newClients.size > MAX_NAMES_SHOWN || newProjects.size > MAX_NAMES_SHOWN) {
      preview.warnings.push(
        `Showing the first ${MAX_NAMES_SHOWN} new names; the counts include them all.`
      );
    }
    preview.newClientCount = newClients.size;
    preview.newProjectCount = newProjects.size;
  };

  if (kind === "clients") {
    const { rows, errors } = normalizeClientRows(parsed, mapping);
    setErrors(errors);
    analysis.clientRows = rows;
    for (const r of rows) noteClient(r.client);
    finish();
    return analysis;
  }

  if (kind === "projects") {
    const { rows, errors } = normalizeProjectRows(parsed, mapping);
    setErrors(errors);
    analysis.projectRows = rows;
    for (const r of rows) {
      noteClient(r.client);
      noteProject(r.client, r.project);
    }
    if (rows.some((r) => r.rate !== null) && members.length > 1) {
      preview.warnings.push(
        "Rates in a project list aren't imported: here a rate belongs to a person on a project. Set them on each project's team, or import time entries (which carry their rate)."
      );
    }
    finish();
    return analysis;
  }

  // Time entries.
  const dateIndex = parsed.headers.indexOf(mapping.date!);
  const detectedFormat = detectDateFormat(parsed.rows.map((r) => r[dateIndex] ?? ""));
  const dateFormat =
    options.dateFormat && options.dateFormat !== "auto" ? options.dateFormat : detectedFormat.format;
  preview.dateFormat = dateFormat;
  preview.dateFormatAmbiguous =
    detectedFormat.ambiguous && (!options.dateFormat || options.dateFormat === "auto");

  const { rows, errors } = normalizeTimeRows(parsed, mapping, dateFormat);
  setErrors(errors);
  analysis.timeRows = rows;

  const imported = await existingHashes(orgId, rows.map((r) => r.hash));
  const invoicedRows = options.invoicedRows ?? "nonbillable";

  // People in the file → members.
  const byEmail = new Map(members.map((m) => [m.email.toLowerCase(), m.userId]));
  const nameCounts = new Map<string, string[]>();
  for (const m of members) nameCounts.set(key(m.name), [...(nameCounts.get(key(m.name)) ?? []), m.userId]);
  const memberIds = new Set(members.map((m) => m.userId));
  const people = new Map<string, ImportPerson>();
  for (const r of rows) {
    let p = people.get(r.personKey);
    if (!p) {
      let userId: string | null = null;
      let matchedBy: ImportPerson["matchedBy"] = null;
      if (r.personEmail && byEmail.has(r.personEmail)) {
        userId = byEmail.get(r.personEmail)!;
        matchedBy = "email";
      } else if (r.personName && nameCounts.get(key(r.personName))?.length === 1) {
        userId = nameCounts.get(key(r.personName))![0];
        matchedBy = "name";
      } else if (!r.personKey && members.length === 1) {
        // A file with no person column, in a one-person org.
        userId = members[0].userId;
        matchedBy = "name";
      }
      // A choice made on the preview wins over the automatic match.
      const chosen = options.people?.[r.personKey];
      if (chosen === SKIP) {
        userId = null;
        matchedBy = null;
      } else if (chosen && memberIds.has(chosen) && chosen !== userId) {
        userId = chosen;
        matchedBy = "chosen";
      }
      p = {
        key: r.personKey,
        name: r.personName || "(no person in the file)",
        email: r.personEmail,
        rows: 0,
        hours: 0,
        userId,
        matchedBy,
      };
      people.set(r.personKey, p);
    }
    p.rows++;
    p.hours = Math.round((p.hours + r.hours) * 100) / 100;
  }
  preview.people = [...people.values()].sort((a, b) => b.rows - a.rows);

  const currencies = new Set<string>();
  for (const r of rows) {
    if (r.currency) currencies.add(r.currency);
    if (imported.has(r.hash)) {
      preview.alreadyImported++;
      continue;
    }
    if (r.invoiced) {
      preview.invoicedInSource++;
      if (invoicedRows === "skip") continue;
    }
    const userId = people.get(r.personKey)?.userId;
    if (!userId) {
      preview.unassignedRows++;
      continue;
    }
    analysis.toCreate.push({ row: r, userId });
    noteClient(r.client);
    noteProject(r.client, r.project);
    preview.hoursToCreate += r.hours;
  }
  preview.entriesToCreate = analysis.toCreate.length;
  preview.hoursToCreate = Math.round(preview.hoursToCreate * 100) / 100;
  preview.sample = rows.slice(0, 10);

  const orgCurrency = (await prisma.organization.findUnique({ where: { id: orgId }, select: { defaultCurrency: true } }))
    ?.defaultCurrency;
  const foreign = [...currencies].filter((c) => c !== orgCurrency);
  if (foreign.length > 0) {
    preview.warnings.push(
      `The file has amounts in ${foreign.join(", ")}; your organization uses ${orgCurrency}. Rates are imported as numbers, not converted.`
    );
  }
  finish();
  return analysis;
}

function readFile(text: string) {
  try {
    return parseCsv(text);
  } catch (err) {
    if (err instanceof ImportFileError) throw new ImportError(err.message);
    throw err;
  }
}

/** Reads the file and reports what an import would do, without writing. */
export async function previewImport(
  orgId: string,
  text: string,
  fileName: string,
  options: ImportOptions
): Promise<ImportPreview> {
  const parsed = readFile(text);
  const { preview } = await analyze(orgId, parsed, fileName, options);
  return preview;
}

export type ImportResult = {
  batchId: string;
  entriesCreated: number;
  clientsCreated: number;
  projectsCreated: number;
  rowsSkipped: number;
  hours: number;
};

/** A cuid-shaped id, so rows can be linked before they're written. */
function newId() {
  return `c${Date.now().toString(36)}${randomBytes(9).toString("hex")}`.slice(0, 25);
}

function mostCommon(values: number[]) {
  const counts = new Map<number, number>();
  let best: number | null = null;
  for (const v of values) {
    const n = (counts.get(v) ?? 0) + 1;
    counts.set(v, n);
    if (best === null || n > (counts.get(best) ?? 0)) best = v;
  }
  return best;
}

/**
 * Imports the file: creates missing clients and projects, puts people on
 * the projects they logged time to, and creates the time entries — skipping
 * rows already imported from an earlier run (so the same file twice adds
 * nothing). Written in chunks; a failure part-way leaves a batch that can be
 * undone or finished by importing the file again.
 */
export async function runImport(
  ctx: { orgId: string; actorId: string },
  text: string,
  fileName: string,
  options: ImportOptions
): Promise<ImportResult> {
  const parsed = readFile(text);
  const a = await analyze(ctx.orgId, parsed, fileName, options);
  const { preview } = a;
  if (preview.mappingProblem) throw new ImportError(preview.mappingProblem);

  const org = await prisma.organization.findUniqueOrThrow({
    where: { id: ctx.orgId },
    select: { defaultCurrency: true, defaultBillRate: true, timesheetApproval: true },
  });

  const nothing =
    preview.kind === "time"
      ? a.toCreate.length === 0
      : preview.newClientCount === 0 && preview.newProjectCount === 0;
  if (nothing) {
    throw new ImportError(
      preview.alreadyImported > 0
        ? "Everything in this file has already been imported."
        : "Nothing in this file can be imported. Check the rows with problems and the people mapping."
    );
  }

  const batch = await prisma.importBatch.create({
    data: {
      orgId: ctx.orgId,
      source: preview.source,
      kind: preview.kind,
      fileName: fileName.slice(0, 200),
      rowCount: preview.totalRows,
      createdById: ctx.actorId,
    },
  });

  // Clients.
  const clientIds = new Map(a.clientsByKey);
  const wantedClients = new Map<string, { name: string; email?: string | null; address?: string | null; phone?: string | null }>();
  if (preview.kind === "clients") {
    for (const r of a.clientRows) {
      if (!clientIds.has(key(r.client)) && !wantedClients.has(key(r.client))) {
        wantedClients.set(key(r.client), { name: r.client, email: r.email, address: r.address, phone: r.phone });
      }
    }
  } else {
    const names = preview.kind === "projects" ? a.projectRows.map((r) => r.client) : a.toCreate.map((t) => t.row.client);
    for (const name of names) {
      if (!clientIds.has(key(name)) && !wantedClients.has(key(name))) wantedClients.set(key(name), { name });
    }
  }
  const createdClientIds: string[] = [];
  const clientList = [...wantedClients.entries()];
  for (let i = 0; i < clientList.length; i += CHUNK) {
    const slice = clientList.slice(i, i + CHUNK).map(([k, c]) => ({ k, id: newId(), ...c }));
    await prisma.client.createMany({
      data: slice.map((c) => ({
        id: c.id,
        orgId: ctx.orgId,
        name: c.name,
        email: c.email ?? null,
        address: c.address ?? null,
        phone: c.phone ?? null,
      })),
    });
    for (const c of slice) {
      clientIds.set(c.k, c.id);
      createdClientIds.push(c.id);
    }
  }

  // Projects.
  const projectIds = new Map(a.projectsByKey);
  const wantedProjects = new Map<string, { client: string; project: string; description: string | null }>();
  const projectSource =
    preview.kind === "projects"
      ? a.projectRows.map((r) => ({ client: r.client, project: r.project, description: r.notes }))
      : preview.kind === "time"
        ? a.toCreate.map((t) => ({ client: t.row.client, project: t.row.project, description: null }))
        : [];
  for (const p of projectSource) {
    const k = projectKey(p.client, p.project);
    if (!projectIds.has(k) && !wantedProjects.has(k)) wantedProjects.set(k, p);
  }
  const createdProjectIds: string[] = [];
  const projectList = [...wantedProjects.entries()];
  for (let i = 0; i < projectList.length; i += CHUNK) {
    const slice = projectList.slice(i, i + CHUNK).map(([k, p]) => ({ k, id: newId(), ...p }));
    await prisma.project.createMany({
      data: slice.map((p) => ({
        id: p.id,
        orgId: ctx.orgId,
        clientId: clientIds.get(key(p.client))!,
        name: p.project,
        description: p.description,
        billingType: "HOURLY" as const,
        confidential: false,
      })),
    });
    for (const p of slice) {
      projectIds.set(p.k, p.id);
      createdProjectIds.push(p.id);
    }
  }

  // People on projects: everyone who logged time to a project joins its
  // team, at the rate they used most in the file (else their usual rate).
  const memberships = await prisma.membership.findMany({
    where: { orgId: ctx.orgId },
    select: { userId: true, billRate: true },
  });
  const usualRate = new Map(memberships.map((m) => [m.userId, resolveBillRate(m.billRate, org.defaultBillRate)]));
  const wantedMembers = new Map<string, { projectId: string; userId: string; rates: number[] }>();
  if (preview.kind === "time") {
    for (const t of a.toCreate) {
      const projectId = projectIds.get(projectKey(t.row.client, t.row.project))!;
      const k = `${projectId}:${t.userId}`;
      const m = wantedMembers.get(k) ?? { projectId, userId: t.userId, rates: [] };
      if (t.row.rate !== null) m.rates.push(t.row.rate);
      wantedMembers.set(k, m);
    }
  } else if (preview.kind === "projects" && memberships.length === 1) {
    // One-person org: the rate in the project list is theirs.
    for (const r of a.projectRows) {
      const projectId = projectIds.get(projectKey(r.client, r.project))!;
      if (!createdProjectIds.includes(projectId)) continue;
      const k = `${projectId}:${ctx.actorId}`;
      const m = wantedMembers.get(k) ?? { projectId, userId: ctx.actorId, rates: [] };
      if (r.rate !== null) m.rates.push(r.rate);
      wantedMembers.set(k, m);
    }
  }
  const createdProjectMemberIds: string[] = [];
  const memberList = [...wantedMembers.values()];
  for (let i = 0; i < memberList.length; i += CHUNK) {
    const slice = memberList.slice(i, i + CHUNK);
    const existing = await prisma.projectMember.findMany({
      where: { OR: slice.map((m) => ({ projectId: m.projectId, userId: m.userId })) },
      select: { projectId: true, userId: true },
    });
    const have = new Set(existing.map((e) => `${e.projectId}:${e.userId}`));
    const missing = slice
      .filter((m) => !have.has(`${m.projectId}:${m.userId}`))
      .map((m) => ({ ...m, id: newId() }));
    if (missing.length === 0) continue;
    await prisma.projectMember.createMany({
      data: missing.map((m) => ({
        id: m.id,
        projectId: m.projectId,
        userId: m.userId,
        billRate: mostCommon(m.rates) ?? usualRate.get(m.userId) ?? 0,
        currency: org.defaultCurrency,
      })),
      skipDuplicates: true,
    });
    createdProjectMemberIds.push(...missing.map((m) => m.id));
  }

  // Time entries, with a record of which file row each came from.
  const invoicedRows = options.invoicedRows ?? "nonbillable";
  const approvedAt = org.timesheetApproval === "OFF" ? null : new Date();
  let entriesCreated = 0;
  let hours = 0;
  try {
    for (let i = 0; i < a.toCreate.length; i += CHUNK) {
      const slice = a.toCreate.slice(i, i + CHUNK).map((t) => ({ ...t, id: newId() }));
      // Raw, array-parameterized inserts: Prisma keeps a plan per distinct
      // createMany (data included), which for a 50k-row file held hundreds
      // of MB after the import finished. The import itself is audited below.
      const now = new Date();
      const entries = slice.map(({ id, row, userId }) => ({
        id,
        projectId: projectIds.get(projectKey(row.client, row.project))!,
        userId,
        date: row.date,
        hours: row.hours.toFixed(2),
        description: row.notes,
        billable: row.invoiced && invoicedRows === "nonbillable" ? false : row.billable,
        rate: row.rate === null ? null : row.rate.toFixed(2),
        hash: row.hash,
      }));
      await prisma.$transaction([
        prisma.$executeRaw`
          INSERT INTO "TimeEntry" ("id", "orgId", "projectId", "userId", "date", "hours", "description",
            "billable", "rateOverride", "approvedAt", "createdAt", "updatedAt")
          SELECT t.id, ${ctx.orgId}, t.project_id, t.user_id, t.day::date, t.hours::decimal(5,2), t.description,
            t.billable, t.rate::decimal(10,2),
            (${approvedAt?.toISOString() ?? null}::timestamptz AT TIME ZONE 'UTC'),
            (${now.toISOString()}::timestamptz AT TIME ZONE 'UTC'), (${now.toISOString()}::timestamptz AT TIME ZONE 'UTC')
          FROM unnest(
            ${entries.map((e) => e.id)}::text[], ${entries.map((e) => e.projectId)}::text[],
            ${entries.map((e) => e.userId)}::text[], ${entries.map((e) => e.date)}::text[],
            ${entries.map((e) => e.hours)}::text[], ${entries.map((e) => e.description)}::text[],
            ${entries.map((e) => e.billable)}::boolean[], ${entries.map((e) => e.rate)}::text[]
          ) AS t(id, project_id, user_id, day, hours, description, billable, rate)`,
        prisma.$executeRaw`
          INSERT INTO "ImportRecord" ("id", "orgId", "rowHash", "batchId", "timeEntryId")
          SELECT t.id || 'r', ${ctx.orgId}, t.hash, ${batch.id}, t.id
          FROM unnest(${entries.map((e) => e.id)}::text[], ${entries.map((e) => e.hash)}::text[]) AS t(id, hash)`,
      ]);
      entriesCreated += slice.length;
      for (const t of slice) hours += t.row.hours;
    }
  } catch (err) {
    if ((err as { code?: string }).code === "P2002") {
      throw new ImportError(
        `Imported ${entriesCreated} entries, then found rows another import just added — is this file being imported twice at once? Import it again to finish; rows already in are skipped.`
      );
    }
    throw err;
  } finally {
    const rowsSkipped =
      preview.kind === "time"
        ? preview.totalRows - entriesCreated
        : preview.errorCount;
    await prisma.importBatch.update({
      where: { id: batch.id },
      data: {
        entriesCreated,
        clientsCreated: createdClientIds.length,
        projectsCreated: createdProjectIds.length,
        rowsSkipped,
        createdClientIds,
        createdProjectIds,
        createdProjectMemberIds,
      },
    });
    await recordAuditEvent(prisma, {
      orgIds: [ctx.orgId],
      actorId: ctx.actorId,
      action: "import",
      entityType: "ImportBatch",
      entityId: batch.id,
      entityLabel: `${SOURCE_LABELS[preview.source]} ${preview.kind}: ${entriesCreated} entries, ${createdClientIds.length} clients, ${createdProjectIds.length} projects from ${fileName.slice(0, 80)}`,
    });
  }

  return {
    batchId: batch.id,
    entriesCreated,
    clientsCreated: createdClientIds.length,
    projectsCreated: createdProjectIds.length,
    rowsSkipped: preview.kind === "time" ? preview.totalRows - entriesCreated : preview.errorCount,
    hours: Math.round(hours * 100) / 100,
  };
}

/**
 * Deletes what an import created: its time entries (only if none is on an
 * invoice), then the people, projects and clients it added that nothing else
 * uses now.
 */
export async function undoImport(ctx: { orgId: string; actorId: string }, batchId: string) {
  const batch = await prisma.importBatch.findFirst({ where: { id: batchId, orgId: ctx.orgId } });
  if (!batch) throw new ImportError("Import not found.");
  if (batch.undoneAt) throw new ImportError("That import has already been undone.");

  const invoiced = await prisma.timeEntry.count({
    where: { orgId: ctx.orgId, importRecord: { batchId }, invoiceLineItemId: { not: null } },
  });
  if (invoiced > 0) {
    throw new ImportError(
      `${invoiced} of this import's time entries ${invoiced === 1 ? "is" : "are"} on an invoice. Void or delete ${invoiced === 1 ? "that invoice" : "those invoices"} first, then undo.`
    );
  }

  let entriesDeleted = 0;
  for (;;) {
    const ids = await prisma.timeEntry.findMany({
      where: { orgId: ctx.orgId, importRecord: { batchId } },
      select: { id: true },
      take: CHUNK,
    });
    if (ids.length === 0) break;
    const { count } = await prisma.timeEntry.deleteMany({
      where: { orgId: ctx.orgId, id: { in: ids.map((e) => e.id) }, invoiceLineItemId: null },
    });
    entriesDeleted += count;
    if (count === 0) break;
  }

  // People the import put on projects, unless they've logged time there since.
  let membersRemoved = 0;
  if (batch.createdProjectMemberIds.length > 0) {
    const members = await prisma.projectMember.findMany({
      where: { id: { in: batch.createdProjectMemberIds }, project: { orgId: ctx.orgId } },
      select: { id: true, projectId: true, userId: true },
    });
    const removable: string[] = [];
    for (const m of members) {
      const used = await prisma.timeEntry.count({ where: { projectId: m.projectId, userId: m.userId } });
      if (used === 0) removable.push(m.id);
    }
    if (removable.length > 0) {
      membersRemoved = (await prisma.projectMember.deleteMany({ where: { id: { in: removable } } })).count;
    }
  }

  // Projects and clients it created, if nothing has been added to them.
  const { count: projectsDeleted } =
    batch.createdProjectIds.length > 0
      ? await prisma.project.deleteMany({
          where: {
            orgId: ctx.orgId,
            id: { in: batch.createdProjectIds },
            timeEntries: { none: {} },
            expenses: { none: {} },
            milestones: { none: {} },
            tasks: { none: {} },
            invoiceLineItems: { none: {} },
            documents: { none: {} },
            members: { none: {} },
          },
        })
      : { count: 0 };
  const { count: clientsDeleted } =
    batch.createdClientIds.length > 0
      ? await prisma.client.deleteMany({
          where: {
            orgId: ctx.orgId,
            id: { in: batch.createdClientIds },
            projects: { none: {} },
            invoices: { none: {} },
            documents: { none: {} },
            contacts: { none: {} },
          },
        })
      : { count: 0 };

  await prisma.importBatch.update({ where: { id: batch.id }, data: { undoneAt: new Date() } });
  await recordAuditEvent(prisma, {
    orgIds: [ctx.orgId],
    actorId: ctx.actorId,
    action: "undo_import",
    entityType: "ImportBatch",
    entityId: batch.id,
    entityLabel: `${batch.fileName}: ${entriesDeleted} entries, ${projectsDeleted} projects, ${clientsDeleted} clients removed`,
  });

  return {
    entriesDeleted,
    membersRemoved,
    projectsDeleted,
    clientsDeleted,
    projectsKept: batch.createdProjectIds.length - projectsDeleted,
    clientsKept: batch.createdClientIds.length - clientsDeleted,
  };
}

export async function listImportBatches(orgId: string) {
  const batches = await prisma.importBatch.findMany({
    where: { orgId },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  const userIds = [...new Set(batches.map((b) => b.createdById).filter((id): id is string => !!id))];
  const users = await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } });
  const names = new Map(users.map((u) => [u.id, u.name]));
  const invoiced = await prisma.importRecord.groupBy({
    by: ["batchId"],
    where: { orgId, batchId: { in: batches.map((b) => b.id) }, timeEntry: { invoiceLineItemId: { not: null } } },
    _count: { _all: true },
  });
  const invoicedBy = new Map(invoiced.map((g) => [g.batchId, g._count._all]));
  return batches.map((b) => ({
    ...b,
    createdByName: b.createdById ? (names.get(b.createdById) ?? "Former member") : null,
    invoicedEntries: invoicedBy.get(b.id) ?? 0,
  }));
}
