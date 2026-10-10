"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  DATE_FORMATS,
  DATE_FORMAT_LABELS,
  FIELD_LABELS,
  IMPORT_KINDS,
  IMPORT_SOURCES,
  KIND_FIELDS,
  KIND_LABELS,
  MAX_IMPORT_BYTES,
  SOURCE_LABELS,
  type ColumnMapping,
  type DateFormat,
  type ImportKind,
  type ImportSource,
} from "@/lib/portability/import-fields";
import type { ImportOptions, ImportPreview, ImportResult } from "@/lib/portability/import";

const selectClass = "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm";
const SKIP = "skip";

type Options = {
  source?: ImportSource;
  kind?: ImportKind;
  mapping?: ColumnMapping;
  dateFormat: DateFormat;
  invoicedRows: NonNullable<ImportOptions["invoicedRows"]>;
  people: Record<string, string>;
};

const initialOptions: Options = { dateFormat: "auto", invoicedRows: "nonbillable", people: {} };

function plural(n: number, one: string, many = `${one}s`) {
  return `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;
}

async function post<T>(path: string, file: File, options: Options): Promise<T> {
  const body = new FormData();
  body.set("file", file);
  body.set("options", JSON.stringify(options));
  const res = await fetch(path, {
    method: "POST",
    body,
    headers: { "x-consultainer-import": "1" },
  });
  const json = (await res.json().catch(() => null)) as ({ error?: string } & T) | null;
  if (!res.ok || !json) throw new Error(json?.error ?? `Something went wrong (${res.status}). Try again.`);
  return json;
}

export function ImportWizard() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [options, setOptions] = useState<Options>(initialOptions);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<"preview" | "import" | null>(null);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setFile(null);
    setOptions(initialOptions);
    setPreview(null);
    setResult(null);
    setDirty(false);
    setError(null);
  }

  async function runPreview(f: File, opts: Options) {
    setBusy("preview");
    setError(null);
    try {
      const { preview: p } = await post<{ preview: ImportPreview }>("/api/import/preview", f, opts);
      setPreview(p);
      // Keep what the server worked out, so the import runs on exactly this.
      setOptions({
        ...opts,
        source: p.source,
        kind: p.kind,
        mapping: p.mapping,
        people: Object.fromEntries(p.people.map((person) => [person.key, person.userId ?? SKIP])),
      });
      setDirty(false);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function runImport() {
    if (!file) return;
    setBusy("import");
    setError(null);
    try {
      const { result: r } = await post<{ result: ImportResult }>("/api/import/run", file, options);
      setResult(r);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  function change(next: Partial<Options>) {
    setOptions((o) => ({ ...o, ...next }));
    setDirty(true);
  }

  if (result) {
    return (
      <div className="flex flex-col gap-3 text-sm">
        <p className="flex items-center gap-2 font-medium">
          <CheckCircle2 className="size-4 text-emerald-600" />
          Imported {plural(result.entriesCreated, "time entry", "time entries")} ({result.hours} h),{" "}
          {plural(result.projectsCreated, "new project")} and {plural(result.clientsCreated, "new client")}.
        </p>
        {result.rowsSkipped > 0 ? (
          <p className="text-muted-foreground">
            {plural(result.rowsSkipped, "row")} skipped (already imported, problems, invoiced or not assigned to anyone).
          </p>
        ) : null}
        <p className="text-muted-foreground">
          Changed your mind? Use <strong>Undo</strong> on this import under Past imports.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link href="/time?view=team" className="text-brand hover:underline">
            View time
          </Link>
          <Link href="/projects" className="text-brand hover:underline">
            View projects
          </Link>
          <button type="button" className="text-brand hover:underline" onClick={reset}>
            Import another file
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="flex flex-col gap-2">
        <Label htmlFor="import-file">CSV file</Label>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            id="import-file"
            type="file"
            accept=".csv,text/csv,text/plain"
            className="max-w-sm"
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null;
              setPreview(null);
              setOptions(initialOptions);
              setError(null);
              if (f && f.size > MAX_IMPORT_BYTES) {
                setFile(null);
                setError(`That file is over ${MAX_IMPORT_BYTES / 1024 / 1024} MB. Export a shorter date range and import it in parts.`);
                return;
              }
              setFile(f);
            }}
          />
          <Button
            type="button"
            disabled={!file || busy !== null}
            onClick={() => file && runPreview(file, initialOptions)}
          >
            <Upload className="size-3.5" />
            {busy === "preview" && !preview ? "Reading..." : "Read file"}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Up to 20 MB and 50,000 rows. Nothing is imported until you confirm.
        </p>
      </div>

      {preview && file ? (
        <PreviewPanel
          preview={preview}
          options={options}
          dirty={dirty}
          busy={busy}
          onChange={change}
          onRefresh={() => runPreview(file, options)}
          onImport={runImport}
        />
      ) : null}
    </div>
  );
}

function PreviewPanel({
  preview: p,
  options,
  dirty,
  busy,
  onChange,
  onRefresh,
  onImport,
}: {
  preview: ImportPreview;
  options: Options;
  dirty: boolean;
  busy: "preview" | "import" | null;
  onChange: (next: Partial<Options>) => void;
  onRefresh: () => void;
  onImport: () => void;
}) {
  const kind = options.kind ?? p.kind;
  const mapping = options.mapping ?? p.mapping;
  const unmatched = p.people.filter((person) => !person.userId);
  const willCreate =
    kind === "time" ? p.entriesToCreate > 0 : p.newClientCount + p.newProjectCount > 0;

  return (
    <div className="flex flex-col gap-5 border-t border-border pt-5">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="import-source">Exported from</Label>
          <select
            id="import-source"
            className={selectClass}
            value={options.source ?? p.source}
            onChange={(e) => onChange({ source: e.target.value as ImportSource })}
          >
            {IMPORT_SOURCES.map((s) => (
              <option key={s} value={s}>
                {SOURCE_LABELS[s]}
                {s === p.detected.source ? " (detected)" : ""}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="import-kind">The file holds</Label>
          <select
            id="import-kind"
            className={selectClass}
            value={kind}
            onChange={(e) => onChange({ kind: e.target.value as ImportKind, mapping: undefined })}
          >
            {IMPORT_KINDS.map((k) => (
              <option key={k} value={k}>
                {KIND_LABELS[k]}
                {k === p.detected.kind ? " (detected)" : ""}
              </option>
            ))}
          </select>
        </div>
      </div>

      <details open={!!p.mappingProblem || p.source === "generic"} className="text-sm">
        <summary className="cursor-pointer font-medium">Columns</summary>
        <p className="mt-2 text-xs text-muted-foreground">
          Which column of your file holds each value. Leave a value on “Not in file” if the file
          doesn&apos;t have it.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {KIND_FIELDS[kind].map((field) => (
            <div key={field} className="flex flex-col gap-1">
              <Label htmlFor={`map-${field}`} className="text-xs">
                {FIELD_LABELS[field]}
              </Label>
              <select
                id={`map-${field}`}
                className={selectClass}
                value={mapping[field] ?? ""}
                onChange={(e) => {
                  const next = { ...mapping };
                  if (e.target.value) next[field] = e.target.value;
                  else delete next[field];
                  onChange({ mapping: next });
                }}
              >
                <option value="">Not in file</option>
                {p.headers.map((h, i) => (
                  <option key={`${h}-${i}`} value={h}>
                    {h}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
      </details>

      {kind === "time" && !p.mappingProblem ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="import-dates">Dates in the file are</Label>
            <select
              id="import-dates"
              className={selectClass}
              value={options.dateFormat === "auto" ? p.dateFormat : options.dateFormat}
              onChange={(e) => onChange({ dateFormat: e.target.value as DateFormat })}
            >
              {DATE_FORMATS.filter((f) => f !== "auto").map((f) => (
                <option key={f} value={f}>
                  {DATE_FORMAT_LABELS[f]}
                </option>
              ))}
            </select>
            {p.dateFormatAmbiguous ? (
              <p className="text-xs text-amber-700 dark:text-amber-400">
                Every date in the file would read either way. Check this matches your export
                settings.
              </p>
            ) : null}
          </div>
          {p.invoicedInSource > 0 || mapping.invoiced ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="import-invoiced">Rows already invoiced in the old tool</Label>
              <select
                id="import-invoiced"
                className={selectClass}
                value={options.invoicedRows}
                onChange={(e) => onChange({ invoicedRows: e.target.value as Options["invoicedRows"] })}
              >
                <option value="nonbillable">Import as non-billable (never invoiced again)</option>
                <option value="skip">Skip them</option>
                <option value="import">Import them as they are</option>
              </select>
            </div>
          ) : null}
        </div>
      ) : null}

      {p.mappingProblem ? (
        <Alert>
          <AlertDescription>{p.mappingProblem}</AlertDescription>
        </Alert>
      ) : (
        <>
          <Summary preview={p} kind={kind} />

          {kind === "time" && p.people.length > 0 ? (
            <div className="flex flex-col gap-2">
              <p className="text-sm font-medium">People</p>
              <p className="text-xs text-muted-foreground">
                Matched to members by email, then by name. Pick a member for anyone unmatched, or
                skip their rows.
              </p>
              {unmatched.length > 1 ? (
                <div className="flex max-w-sm flex-col gap-1">
                  <Label htmlFor="assign-all" className="text-xs">
                    Assign everyone unmatched to
                  </Label>
                  <select
                    id="assign-all"
                    className={selectClass}
                    defaultValue=""
                    onChange={(e) => {
                      if (!e.target.value) return;
                      const people = { ...options.people };
                      for (const person of unmatched) people[person.key] = e.target.value;
                      onChange({ people });
                    }}
                  >
                    <option value="">Choose…</option>
                    <option value={SKIP}>Skip their rows</option>
                    {p.members.map((m) => (
                      <option key={m.userId} value={m.userId}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 font-medium">In the file</th>
                      <th className="px-3 py-2 text-right font-medium">Rows</th>
                      <th className="px-3 py-2 text-right font-medium">Hours</th>
                      <th className="px-3 py-2 font-medium">Import as</th>
                    </tr>
                  </thead>
                  <tbody>
                    {p.people.map((person) => (
                      <tr key={person.key} className="border-t border-border">
                        <td className="px-3 py-2">
                          <div>{person.name}</div>
                          {person.email ? (
                            <div className="text-xs text-muted-foreground">{person.email}</div>
                          ) : null}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{person.rows}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{person.hours}</td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-2">
                            <select
                              aria-label={`Import ${person.name}'s rows as`}
                              className={selectClass}
                              value={options.people[person.key] ?? SKIP}
                              onChange={(e) =>
                                onChange({ people: { ...options.people, [person.key]: e.target.value } })
                              }
                            >
                              <option value={SKIP}>Skip these rows</option>
                              {p.members.map((m) => (
                                <option key={m.userId} value={m.userId}>
                                  {m.name} ({m.email})
                                </option>
                              ))}
                            </select>
                            {person.matchedBy === "email" || person.matchedBy === "name" ? (
                              <Badge variant="secondary">by {person.matchedBy}</Badge>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          {p.errorCount > 0 ? (
            <details className="text-sm">
              <summary className="cursor-pointer font-medium">
                {plural(p.errorCount, "row")}{" "}can&apos;t be imported
              </summary>
              <ul className="mt-2 flex flex-col gap-0.5 text-xs text-muted-foreground">
                {p.errors.map((e) => (
                  <li key={e.row}>
                    Line {e.row}: {e.message}
                  </li>
                ))}
                {p.errorCount > p.errors.length ? (
                  <li>…and {plural(p.errorCount - p.errors.length, "more row")}.</li>
                ) : null}
              </ul>
            </details>
          ) : null}
        </>
      )}

      {p.warnings.map((w) => (
        <p key={w} className="flex items-start gap-2 text-xs text-amber-700 dark:text-amber-400">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          {w}
        </p>
      ))}

      <div className="flex flex-wrap items-center gap-3">
        {dirty ? (
          <Button type="button" onClick={onRefresh} disabled={busy !== null}>
            {busy === "preview" ? "Updating..." : "Update preview"}
          </Button>
        ) : (
          <Button
            type="button"
            onClick={onImport}
            disabled={busy !== null || !!p.mappingProblem || !willCreate}
          >
            {busy === "import"
              ? "Importing..."
              : kind === "time"
                ? `Import ${plural(p.entriesToCreate, "time entry", "time entries")}`
                : `Import ${plural(p.newClientCount, "client")} and ${plural(p.newProjectCount, "project")}`}
          </Button>
        )}
        {dirty ? (
          <p className="text-xs text-muted-foreground">Update the preview to see what changes.</p>
        ) : null}
      </div>
    </div>
  );
}

function Summary({ preview: p, kind }: { preview: ImportPreview; kind: ImportKind }) {
  const stats: [string, string][] =
    kind === "time"
      ? [
          ["Time entries to import", `${p.entriesToCreate.toLocaleString("en-US")} (${p.hoursToCreate} h)`],
          ["New clients", p.newClientCount.toLocaleString("en-US")],
          ["New projects", p.newProjectCount.toLocaleString("en-US")],
          ["People in the file", `${p.people.length} (${p.people.filter((x) => !x.userId).length} unmatched)`],
          ["Already imported (skipped)", p.alreadyImported.toLocaleString("en-US")],
          ["Not assigned to anyone (skipped)", p.unassignedRows.toLocaleString("en-US")],
          ["Rows with problems (skipped)", p.errorCount.toLocaleString("en-US")],
          ...(p.invoicedInSource > 0
            ? ([["Already invoiced in the old tool", p.invoicedInSource.toLocaleString("en-US")]] as [string, string][])
            : []),
        ]
      : [
          ["Rows in the file", p.totalRows.toLocaleString("en-US")],
          ["New clients", p.newClientCount.toLocaleString("en-US")],
          ["Clients that already exist", p.existingClients.toLocaleString("en-US")],
          ...(kind === "projects"
            ? ([
                ["New projects", p.newProjectCount.toLocaleString("en-US")],
                ["Projects that already exist", p.existingProjects.toLocaleString("en-US")],
              ] as [string, string][])
            : []),
          ["Rows with problems (skipped)", p.errorCount.toLocaleString("en-US")],
        ];

  return (
    <div className="flex flex-col gap-3">
      <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
        {stats.map(([label, value]) => (
          <div key={label} className="flex justify-between gap-3 border-b border-border/60 py-1">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
      {p.newClients.length + p.newProjects.length > 0 ? (
        <details className="text-sm">
          <summary className="cursor-pointer font-medium">New clients and projects</summary>
          <ul className="mt-2 flex flex-col gap-0.5 text-xs text-muted-foreground">
            {p.newClients.map((c) => (
              <li key={`c-${c}`}>Client: {c}</li>
            ))}
            {p.newProjects.map((x) => (
              <li key={`p-${x.client}-${x.project}`}>
                Project: {x.project} <span className="opacity-70">({x.client})</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted-foreground">
            New projects are hourly and not confidential. People who logged time to one are put
            on it at the rate in the file (or their usual rate).
          </p>
        </details>
      ) : null}
    </div>
  );
}
