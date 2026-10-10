// Reading time-tracker exports (Harvest, Toggl Track, Clockify, or any CSV
// with a column mapping) into plain rows. No database access here, so it can
// be tested on its own; lib/portability/import.ts does the writing.
import { createHash } from "crypto";
import Papa from "papaparse";
import {
  KIND_FIELDS,
  MAX_IMPORT_ROWS,
  type ColumnMapping,
  type DateFormat,
  type ImportField,
  type ImportKind,
  type ImportSource,
} from "@/lib/portability/import-fields";

export * from "@/lib/portability/import-fields";

/** "Billable Rate (USD)" → "billablerate"; "Billable?" → "billable";
 * "Duration (decimal)" → "durationdecimal". */
export function normalizeHeader(header: string) {
  return header
    .replace(/^﻿/, "")
    .trim()
    .toLowerCase()
    .replace(/\(\s*[a-z]{3}\s*\)$/, "") // trailing currency code: "(usd)"
    .replace(/[^a-z0-9]/g, "");
}

// Normalized header names each field is read from, most specific first.
// Harvest's detailed time export, Toggl Track's detailed report and
// Clockify's detailed report all land on these.
const ALIASES: Record<ImportField, string[]> = {
  date: ["date", "startdate", "spentdate", "day", "workdate", "entrydate"],
  hours: ["hours", "durationdecimal", "decimalduration", "hoursdecimal", "timehours"],
  duration: ["duration", "durationh", "durationhhmmss", "timehms", "timespent", "timelogged", "timetracked", "trackedtime", "loggedtime"],
  startTime: ["starttime"],
  endTime: ["endtime"],
  client: ["client", "clientname", "customer", "customername", "company"],
  project: ["project", "projectname"],
  task: ["task", "taskname", "activity", "service"],
  notes: ["notes", "description", "note", "comment", "comments", "details", "projectnotes"],
  billable: ["billable", "isbillable", "billablestatus"],
  invoiced: ["invoiced", "isinvoiced", "invoicedstatus"],
  rate: ["billablerate", "rate", "hourlyrate", "billrate", "billablerates", "ratehourly"],
  amount: ["billableamount", "amount", "billableamounts"],
  person: ["user", "member", "person", "username", "teammember", "staff", "fullname", "employeename"],
  firstName: ["firstname", "givenname"],
  lastName: ["lastname", "surname", "familyname"],
  email: ["email", "useremail", "emailaddress", "memberemail"],
  currency: ["currency"],
  address: ["address", "billingaddress", "clientaddress"],
  phone: ["phone", "phonenumber", "telephone"],
};

// In a projects or clients list, the record's own name is often just "Name".
const KIND_EXTRA_ALIASES: Partial<Record<ImportKind, Partial<Record<ImportField, string[]>>>> = {
  projects: { project: ["name"] },
  clients: { client: ["name"] },
};

// Any of these means the rows are time entries.
const TIME_HEADERS = [...ALIASES.hours, ...ALIASES.duration];

/** Works out which tool made the file, and whether it's time entries or a
 * list of projects or clients, from its header row. */
export function detectSource(headers: string[]): { source: ImportSource; kind: ImportKind } {
  const set = new Set(headers.map(normalizeHeader));
  const has = (...names: string[]) => names.every((n) => set.has(n));
  const any = (...names: string[]) => names.some((n) => set.has(n));

  if (any(...TIME_HEADERS) || has("starttime", "endtime")) {
    // Harvest: "Hours", "First Name", "Last Name", "Billable?"…
    if (has("hours", "firstname", "lastname")) return { source: "harvest", kind: "time" };
    // Clockify: "Duration (h)" and "Duration (decimal)".
    if (any("durationdecimal", "durationh")) return { source: "clockify", kind: "time" };
    // Toggl Track: "Duration" (hh:mm:ss) plus "Start date"/"Start time".
    if (has("duration", "startdate", "starttime") && any("user", "member", "email")) {
      return { source: "toggl", kind: "time" };
    }
    return { source: "generic", kind: "time" };
  }

  const isProjects = any("project", "projectname") || (has("name", "client"));
  const kind: ImportKind = isProjects ? "projects" : "clients";
  // Harvest's project list has "Project Code"; Clockify's has "Billability".
  if (any("projectcode", "projectnotes")) return { source: "harvest", kind };
  if (any("billability", "trackedh")) return { source: "clockify", kind };
  return { source: "generic", kind };
}

/** Picks a column for each field from the header names. */
export function autoMapColumns(headers: string[], kind: ImportKind): ColumnMapping {
  const byNorm = new Map<string, string>();
  for (const h of headers) {
    const n = normalizeHeader(h);
    if (n && !byNorm.has(n)) byNorm.set(n, h);
  }
  const used = new Set<string>();
  const mapping: ColumnMapping = {};
  for (const field of KIND_FIELDS[kind]) {
    const aliases = [...ALIASES[field], ...(KIND_EXTRA_ALIASES[kind]?.[field] ?? [])];
    for (const alias of aliases) {
      const header = byNorm.get(alias);
      if (header && !used.has(header)) {
        mapping[field] = header;
        used.add(header);
        break;
      }
    }
  }
  // "Hours" was taken by the decimal field; don't also read it as duration.
  if (mapping.hours && mapping.duration === mapping.hours) delete mapping.duration;
  return mapping;
}

/** What's missing from a mapping before it can be imported, or null. */
export function mappingProblem(mapping: ColumnMapping, kind: ImportKind): string | null {
  if (kind === "time") {
    if (!mapping.date) return "Pick the column that holds each entry's date.";
    if (!mapping.hours && !mapping.duration && !(mapping.startTime && mapping.endTime)) {
      return "Pick the column with hours or duration (or both start and end time).";
    }
    if (!mapping.project) return "Pick the column that holds the project.";
    return null;
  }
  if (kind === "projects") {
    return mapping.project ? null : "Pick the column that holds the project name.";
  }
  return mapping.client ? null : "Pick the column that holds the client name.";
}

// ── Values ─────────────────────────────────────────────────────────────────

const DATE_PARTS = /^(\d{1,4})[/.\-](\d{1,2})[/.\-](\d{1,4})(?:$|[\sT])/;

function splitDate(value: string) {
  const m = value.trim().match(DATE_PARTS);
  return m ? ([m[1], m[2], m[3]] as const) : null;
}

/** Decides day-first or month-first from every date in the column: a first
 * part over 12 means day-first, a second part over 12 means month-first.
 * `ambiguous` when nothing in the file settles it. */
export function detectDateFormat(values: string[]): { format: Exclude<DateFormat, "auto">; ambiguous: boolean } {
  let firstOver12 = false;
  let secondOver12 = false;
  let dotted = false;
  let sawDayMonth = false;
  for (const v of values) {
    const parts = splitDate(v);
    if (!parts) continue;
    if (parts[0].length === 4) continue; // year first
    sawDayMonth = true;
    if (v.includes(".")) dotted = true;
    if (Number(parts[0]) > 12) firstOver12 = true;
    if (Number(parts[1]) > 12) secondOver12 = true;
  }
  if (!sawDayMonth) return { format: "ymd", ambiguous: false };
  if (firstOver12 && !secondOver12) return { format: "dmy", ambiguous: false };
  if (secondOver12 && !firstOver12) return { format: "mdy", ambiguous: false };
  // Nothing settles it. Dotted dates (31.03.2026) are day-first in practice;
  // otherwise assume the US order the three tools default to.
  return { format: dotted ? "dmy" : "mdy", ambiguous: true };
}

/** A CSV date as a calendar day, "YYYY-MM-DD" — never shifted by a time
 * zone. Null if it isn't a real date. */
export function parseCalendarDate(value: string, format: Exclude<DateFormat, "auto">) {
  const parts = splitDate(value);
  if (!parts) return null;
  let y: string, m: string, d: string;
  if (parts[0].length === 4) [y, m, d] = parts;
  else if (format === "dmy") [d, m, y] = parts;
  else if (format === "mdy") [m, d, y] = parts;
  else return null;
  let year = Number(y);
  if (y.length === 2) year += 2000;
  else if (y.length !== 4) return null;
  const month = Number(m);
  const day = Number(d);
  if (month < 1 || month > 12 || day < 1) return null;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (day > daysInMonth) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** "1.5", "1,5", "1:30", "01:30:00", "1h 30m" → 1.5. Null if unreadable. */
export function parseHours(value: string): number | null {
  const v = value.trim();
  if (!v) return null;
  let m = v.match(/^(\d+):(\d{1,2})(?::(\d{1,2}))?$/);
  if (m) return Number(m[1]) + Number(m[2]) / 60 + Number(m[3] ?? 0) / 3600;
  m = v.match(/^(?:(\d+(?:\.\d+)?)\s*h)?\s*(?:(\d+)\s*m(?:in)?)?$/i);
  if (m && (m[1] || m[2])) return Number(m[1] ?? 0) + Number(m[2] ?? 0) / 60;
  const n = Number(v.replace(/^(\d+),(\d+)$/, "$1.$2"));
  return Number.isFinite(n) ? n : null;
}

/** "$1,250.00", "1250", "150,00" → number. Null when blank or unreadable. */
export function parseMoney(value: string): number | null {
  let v = value.trim().replace(/[^\d.,\-]/g, "");
  if (!v) return null;
  if (/^-?\d+,\d{1,2}$/.test(v)) v = v.replace(",", ".");
  else v = v.replace(/,/g, "");
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Yes/no-ish → boolean; null when blank or unrecognized. */
export function parseYesNo(value: string): boolean | null {
  const v = value.trim().toLowerCase();
  if (["yes", "y", "true", "1", "billable", "invoiced"].includes(v)) return true;
  if (["no", "n", "false", "0", "non-billable", "nonbillable", "not billable", "uninvoiced"].includes(v)) {
    return false;
  }
  return null;
}

/** "09:00", "9:00 AM", "17:30:00", "2026-03-31 09:00" → minutes after midnight. */
function parseClock(value: string): number | null {
  const m = value.trim().match(/(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([ap]\.?m\.?)?$/i);
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2]);
  const ap = m[4]?.toLowerCase().replace(/\./g, "");
  if (ap === "pm" && h < 12) h += 12;
  if (ap === "am" && h === 12) h = 0;
  if (h > 23 || min > 59) return null;
  return h * 60 + min + Number(m[3] ?? 0) / 60;
}

// ── Parsing a file ─────────────────────────────────────────────────────────

export class ImportFileError extends Error {}

export type ParsedCsv = { headers: string[]; rows: string[][] };

/** Parses the CSV text: the first non-empty line is the header row. Stops
 * (with an error) past MAX_IMPORT_ROWS rather than reading the whole file. */
export function parseCsv(text: string): ParsedCsv {
  const result = Papa.parse<string[]>(text.replace(/^﻿/, ""), {
    header: false,
    skipEmptyLines: "greedy",
    // One extra row past the limit, so "too many" is detectable.
    preview: MAX_IMPORT_ROWS + 2,
  });
  const all = result.data;
  if (all.length === 0) throw new ImportFileError("That file is empty.");
  const headers = all[0].map((h) => h.replace(/^﻿/, "").trim());
  if (headers.filter(Boolean).length < 2) {
    throw new ImportFileError(
      "That doesn't look like a CSV with a header row. Export it as CSV (comma-separated) and try again."
    );
  }
  const rows = all.slice(1);
  if (rows.length === 0) throw new ImportFileError("That file has a header row but no data rows.");
  if (rows.length > MAX_IMPORT_ROWS) {
    throw new ImportFileError(
      `That file has more than ${MAX_IMPORT_ROWS.toLocaleString("en-US")} rows. Export a shorter date range and import it in parts.`
    );
  }
  return { headers, rows };
}

export type RowError = { row: number; message: string };

export type TimeRow = {
  /** Line in the file (the header is line 1). */
  row: number;
  date: string;
  hours: number;
  client: string;
  project: string;
  notes: string | null;
  billable: boolean;
  invoiced: boolean;
  rate: number | null;
  currency: string | null;
  personName: string;
  personEmail: string | null;
  /** Who the row belongs to in the file: email, else name; "" when the
   * file doesn't say. */
  personKey: string;
  /** Stable for the same row of the same file — re-imports skip it. */
  hash: string;
};

export type ProjectRow = { row: number; client: string; project: string; rate: number | null; notes: string | null };
export type ClientRow = { row: number; client: string; email: string | null; address: string | null; phone: string | null };

/** Rows with no client get this one, since every project needs a client. */
export const NO_CLIENT_NAME = "No client";

type Getter = (row: string[], field: ImportField) => string;

function getter(headers: string[], mapping: ColumnMapping): Getter {
  const index = new Map<ImportField, number>();
  for (const [field, header] of Object.entries(mapping) as [ImportField, string][]) {
    const i = headers.indexOf(header);
    if (i >= 0) index.set(field, i);
  }
  return (row, field) => {
    const i = index.get(field);
    return i === undefined ? "" : (row[i] ?? "").trim();
  };
}

function personKeyOf(email: string | null, name: string) {
  if (email) return email.toLowerCase();
  return name ? `name:${name.toLowerCase().replace(/\s+/g, " ")}` : "";
}

export function normalizeTimeRows(
  parsed: ParsedCsv,
  mapping: ColumnMapping,
  dateFormat: Exclude<DateFormat, "auto">
): { rows: TimeRow[]; errors: RowError[] } {
  const get = getter(parsed.headers, mapping);
  const rows: TimeRow[] = [];
  const errors: RowError[] = [];
  const seen = new Map<string, number>();

  parsed.rows.forEach((raw, i) => {
    const row = i + 2;
    const fail = (message: string) => errors.push({ row, message });

    const dateRaw = get(raw, "date");
    if (!dateRaw) return fail("No date.");
    const date = parseCalendarDate(dateRaw, dateFormat);
    if (!date) return fail(`"${dateRaw}" isn't a date in the chosen format.`);

    let hours: number | null = null;
    const hoursRaw = get(raw, "hours");
    const durationRaw = get(raw, "duration");
    if (hoursRaw) hours = parseHours(hoursRaw);
    else if (durationRaw) hours = parseHours(durationRaw);
    else if (get(raw, "startTime") && get(raw, "endTime")) {
      const start = parseClock(get(raw, "startTime"));
      const end = parseClock(get(raw, "endTime"));
      if (start !== null && end !== null) hours = ((end - start + 1440) % 1440) / 60;
    }
    const shown = hoursRaw || durationRaw;
    if (hours === null) return fail(shown ? `"${shown}" isn't a number of hours.` : "No hours or duration.");
    hours = Math.round(hours * 100) / 100;
    if (hours <= 0) return fail("Zero hours (a running or empty timer).");
    if (hours > 24) return fail(`${hours} hours in one entry — more than a day.`);

    const project = get(raw, "project");
    if (!project) return fail("No project. Every time entry here needs one.");
    if (project.length > 200) return fail("Project name is longer than 200 characters.");
    const client = get(raw, "client") || NO_CLIENT_NAME;
    if (client.length > 200) return fail("Client name is longer than 200 characters.");

    const task = get(raw, "task");
    const desc = get(raw, "notes");
    const notes = [task, desc].filter(Boolean).join(": ").slice(0, 5000) || null;

    const billableRaw = get(raw, "billable");
    const billable = billableRaw ? (parseYesNo(billableRaw) ?? true) : true;
    const invoiced = parseYesNo(get(raw, "invoiced")) ?? false;

    let rate = parseMoney(get(raw, "rate"));
    if (rate === null) {
      const amount = parseMoney(get(raw, "amount"));
      if (amount !== null && amount > 0) rate = Math.round((amount / hours) * 100) / 100;
    }
    if (rate !== null && (rate < 0 || rate >= 100_000_000)) return fail(`Rate ${rate} is out of range.`);
    if (rate === 0) rate = null;

    const email = get(raw, "email").toLowerCase() || null;
    const personName =
      get(raw, "person") || [get(raw, "firstName"), get(raw, "lastName")].filter(Boolean).join(" ");
    const personKey = personKeyOf(email, personName);

    const content = JSON.stringify([
      date,
      hours.toFixed(2),
      client.toLowerCase(),
      project.toLowerCase(),
      notes,
      billableRaw.toLowerCase(),
      rate,
      personKey,
    ]);
    const n = (seen.get(content) ?? 0) + 1;
    seen.set(content, n);
    const hash = createHash("sha256").update(`${content}#${n}`).digest("hex");

    rows.push({
      row,
      date,
      hours,
      client,
      project,
      notes,
      billable,
      invoiced,
      rate,
      // Harvest writes "US Dollar - USD"; keep just the code.
      currency:
        get(raw, "currency").toUpperCase().match(/\b([A-Z]{3})\s*$/)?.[1] ?? currencyFromHeaders(parsed.headers),
      personName: personName || email || "",
      personEmail: email,
      personKey,
      hash,
    });
  });

  return { rows, errors };
}

/** "Billable Rate (USD)" → "USD". */
function currencyFromHeaders(headers: string[]) {
  for (const h of headers) {
    const m = h.match(/\(\s*([A-Za-z]{3})\s*\)\s*$/);
    if (m && !/^(h|dec)/i.test(m[1])) return m[1].toUpperCase();
  }
  return null;
}

export function normalizeProjectRows(parsed: ParsedCsv, mapping: ColumnMapping) {
  const get = getter(parsed.headers, mapping);
  const rows: ProjectRow[] = [];
  const errors: RowError[] = [];
  parsed.rows.forEach((raw, i) => {
    const row = i + 2;
    const project = get(raw, "project");
    if (!project) return errors.push({ row, message: "No project name." });
    if (project.length > 200) return errors.push({ row, message: "Project name is longer than 200 characters." });
    const rate = parseMoney(get(raw, "rate"));
    rows.push({
      row,
      project,
      client: get(raw, "client") || NO_CLIENT_NAME,
      rate: rate && rate > 0 && rate < 100_000_000 ? rate : null,
      notes: get(raw, "notes").slice(0, 5000) || null,
    });
  });
  return { rows, errors };
}

export function normalizeClientRows(parsed: ParsedCsv, mapping: ColumnMapping) {
  const get = getter(parsed.headers, mapping);
  const rows: ClientRow[] = [];
  const errors: RowError[] = [];
  parsed.rows.forEach((raw, i) => {
    const row = i + 2;
    const client = get(raw, "client");
    if (!client) return errors.push({ row, message: "No client name." });
    if (client.length > 200) return errors.push({ row, message: "Client name is longer than 200 characters." });
    const email = get(raw, "email");
    rows.push({
      row,
      client,
      email: email && /^[^\s@]+@[^\s@]+$/.test(email) ? email : null,
      address: get(raw, "address") || null,
      phone: get(raw, "phone") || null,
    });
  });
  return { rows, errors };
}
