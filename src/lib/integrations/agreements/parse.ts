// Turns each e-signature provider's list response into one shape. Pure (no
// network, no server-only imports) so it can be tested against the sample
// payloads from the providers' docs. The fetching lives in providers.ts.

export type AgreementProviderId = "DOCUSIGN" | "DOCUMENSO" | "IRONCLAD";

export const AGREEMENT_PROVIDERS: AgreementProviderId[] = ["DOCUSIGN", "DOCUMENSO", "IRONCLAD"];

export const AGREEMENT_PROVIDER_LABELS: Record<AgreementProviderId, string> = {
  DOCUSIGN: "DocuSign",
  DOCUMENSO: "Documenso",
  IRONCLAD: "Ironclad",
};

export type Signer = { name: string | null; email: string | null };

export type PulledAgreement = {
  externalId: string;
  title: string;
  status: string;
  signedAt: Date | null;
  signers: Signer[];
  /** Opens it in the provider's web app. */
  externalUrl: string | null;
  /** Ironclad's counterparty name, matched against client names. */
  counterparty: string | null;
  /** Where the signed PDF is downloaded from (a provider API URL). */
  downloadUrl: string | null;
  /** When the provider last changed it; drives the next sync's start. */
  changedAt: Date | null;
};

type Json = Record<string, unknown>;

const isObject = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

function date(v: unknown) {
  const s = str(v);
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

const EMAIL = /^[^\s@<>()]+@[^\s@<>()]+\.[a-z]{2,}$/i;

function signer(name: unknown, email: unknown): Signer | null {
  const e = str(email);
  const n = str(name);
  if (!e && !n) return null;
  return { name: n, email: e && EMAIL.test(e) ? e.toLowerCase() : null };
}

function dedupeSigners(list: (Signer | null)[]) {
  const seen = new Set<string>();
  const out: Signer[] = [];
  for (const s of list) {
    if (!s) continue;
    const key = (s.email ?? s.name ?? "").toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
}

// ── DocuSign ────────────────────────────────────────────────────────────────
// GET {base_uri}/restapi/v2.1/accounts/{accountId}/envelopes
//   ?from_date=…&status=completed&include=recipients
// → { resultSetSize, startPosition, endPosition, totalSetSize, nextUri,
//     envelopes: [{ envelopeId, status, emailSubject, completedDateTime,
//                   statusChangedDateTime, recipients: { signers: [...] } }] }
// Positions and sizes come back as strings.

/** The DocuSign web app for an environment, for "Open in DocuSign". */
export function docuSignAppBase(environment: string) {
  return environment === "production" ? "https://app.docusign.com" : "https://appdemo.docusign.com";
}

export function parseDocuSignEnvelopes(
  body: unknown,
  ctx: { appBase: string; apiBase: string }
): { items: PulledAgreement[]; nextStart: number | null } {
  if (!isObject(body)) return { items: [], nextStart: null };
  const envelopes = Array.isArray(body.envelopes) ? body.envelopes : [];
  const items: PulledAgreement[] = [];
  for (const env of envelopes) {
    if (!isObject(env)) continue;
    // GUIDs, kept lower-case so pasted links match.
    const id = str(env.envelopeId)?.toLowerCase() ?? null;
    const status = str(env.status);
    // Read-only and signed-only: anything not completed is skipped.
    if (!id || status?.toLowerCase() !== "completed") continue;
    const recipients = isObject(env.recipients) ? env.recipients : {};
    const signers = Array.isArray(recipients.signers) ? recipients.signers : [];
    items.push({
      externalId: id,
      title: (str(env.emailSubject) ?? "Untitled envelope").slice(0, 255),
      status,
      signedAt: date(env.completedDateTime),
      signers: dedupeSigners(signers.map((s) => (isObject(s) ? signer(s.name, s.email) : null))),
      externalUrl: `${ctx.appBase}/documents/details/${encodeURIComponent(id)}`,
      counterparty: null,
      downloadUrl: `${ctx.apiBase}/envelopes/${encodeURIComponent(id)}/documents/combined`,
      changedAt: date(env.statusChangedDateTime) ?? date(env.completedDateTime),
    });
  }
  const end = Number(body.endPosition);
  const total = Number(body.totalSetSize);
  const nextStart =
    envelopes.length > 0 && Number.isFinite(end) && Number.isFinite(total) && end + 1 < total ? end + 1 : null;
  return { items, nextStart };
}

/** DocuSign's /oauth/userinfo: the default account (or the first). */
export function parseDocuSignUserInfo(body: unknown) {
  if (!isObject(body) || !Array.isArray(body.accounts)) return null;
  const accounts = body.accounts.filter(isObject);
  const account = accounts.find((a) => a.is_default === true || a.is_default === "true") ?? accounts[0];
  const accountId = account && str(account.account_id);
  const baseUri = account && str(account.base_uri);
  if (!accountId || !baseUri) return null;
  return {
    accountId,
    accountName: str(account.account_name),
    baseUri: baseUri.replace(/\/+$/, ""),
    email: str(body.email),
  };
}

/** base_uri must be a DocuSign host — it's where the access token goes. */
export function isDocuSignBaseUri(raw: string) {
  try {
    const url = new URL(raw);
    return url.protocol === "https:" && /(^|\.)docusign\.(net|com)$/i.test(url.hostname);
  } catch {
    return false;
  }
}

// ── Documenso ───────────────────────────────────────────────────────────────
// GET {base}/api/v2/document?status=COMPLETED&page=1&perPage=100
// → { data: [{ id, title, status, completedAt, updatedAt, team: { url },
//              recipients: [{ name, email, role, signingStatus }] }],
//     count, currentPage, perPage, totalPages }

/** "https://sign.example.com/" or ".../api/v2" → "https://sign.example.com". */
export function documensoAppBase(raw: string) {
  const trimmed = raw.trim().replace(/\/+$/, "").replace(/\/api\/v[12](-beta)?$/i, "");
  return trimmed || "https://app.documenso.com";
}

export function parseDocumensoDocuments(
  body: unknown,
  ctx: { appBase: string }
): { items: PulledAgreement[]; nextPage: number | null } {
  if (!isObject(body)) return { items: [], nextPage: null };
  const docs = Array.isArray(body.data) ? body.data : [];
  const items: PulledAgreement[] = [];
  for (const doc of docs) {
    if (!isObject(doc)) continue;
    const id = typeof doc.id === "number" || typeof doc.id === "string" ? String(doc.id) : null;
    const status = str(doc.status);
    if (!id || status !== "COMPLETED") continue;
    const recipients = Array.isArray(doc.recipients) ? doc.recipients.filter(isObject) : [];
    const teamUrl = isObject(doc.team) ? str(doc.team.url) : null;
    items.push({
      externalId: id,
      title: (str(doc.title) ?? "Untitled document").slice(0, 255),
      status,
      signedAt: date(doc.completedAt),
      signers: dedupeSigners(
        recipients
          .filter((r) => r.role === "SIGNER" || r.role === "APPROVER")
          .map((r) => signer(r.name, r.email))
      ),
      externalUrl: teamUrl
        ? `${ctx.appBase}/t/${encodeURIComponent(teamUrl)}/documents/${encodeURIComponent(id)}`
        : `${ctx.appBase}/documents/${encodeURIComponent(id)}`,
      counterparty: null,
      downloadUrl: `${ctx.appBase}/api/v2/document/${encodeURIComponent(id)}/download?version=signed`,
      changedAt: date(doc.updatedAt) ?? date(doc.completedAt),
    });
  }
  const page = Number(body.currentPage);
  const pages = Number(body.totalPages);
  return { items, nextPage: Number.isFinite(page) && Number.isFinite(pages) && page < pages ? page + 1 : null };
}

// ── Ironclad ────────────────────────────────────────────────────────────────
// GET https://{host}/public/api/v1/records?lastUpdated=…&page=0&pageSize=100
// → { page, pageSize, count, list: [{ id, ironcladId, name, type,
//     lastUpdated, properties: { <key>: { type, value } },
//     attachments: { signedCopy: { filename, href, contentType } } }] }
// Records are executed contracts, so every one counts as signed. Property
// keys vary per Ironclad account; the date and counterparty ones below are
// Ironclad's standard ones.

export const IRONCLAD_HOSTS: Record<string, string> = {
  na1: "ironcladapp.com",
  eu1: "eu1.ironcladapp.com",
  demo: "demo.ironcladapp.com",
};

const IRONCLAD_DATE_KEYS = ["executedDate", "signedDate", "agreementDate"];

function propertyValue(props: Json, key: string): unknown {
  const p = props[key];
  return isObject(p) ? p.value : p;
}

export function parseIroncladRecords(
  body: unknown,
  ctx: { host: string }
): { items: PulledAgreement[]; nextPage: number | null } {
  if (!isObject(body)) return { items: [], nextPage: null };
  const list = Array.isArray(body.list) ? body.list : [];
  const items: PulledAgreement[] = [];
  for (const rec of list) {
    if (!isObject(rec)) continue;
    const id = str(rec.id)?.toLowerCase() ?? null;
    if (!id) continue;
    const props = isObject(rec.properties) ? rec.properties : {};
    let signedAt: Date | null = null;
    for (const key of IRONCLAD_DATE_KEYS) {
      signedAt = date(propertyValue(props, key));
      if (signedAt) break;
    }
    // Signer details aren't standard record properties: take any email
    // address the record's properties hold (e.g. counterparty signer email).
    const emails = Object.values(props)
      .map((p) => (isObject(p) ? p.value : p))
      .filter((v): v is string => typeof v === "string" && EMAIL.test(v.trim()));
    const attachments = isObject(rec.attachments) ? rec.attachments : {};
    const signed = isObject(attachments.signedCopy) ? attachments.signedCopy : null;
    const href = signed ? str(signed.href) : null;
    items.push({
      externalId: id,
      title: (str(rec.name) ?? str(rec.ironcladId) ?? "Untitled record").slice(0, 255),
      status: str(rec.contractStatus) ?? "executed",
      signedAt,
      signers: dedupeSigners(emails.map((e) => signer(null, e))),
      externalUrl: `https://${ctx.host}/records/${encodeURIComponent(id)}`,
      counterparty: str(propertyValue(props, "counterpartyName")),
      // Only ever send the token to an Ironclad host.
      downloadUrl: href && isIroncladUrl(href) ? href : null,
      changedAt: date(rec.lastUpdated),
    });
  }
  const page = Number(body.page);
  const size = Number(body.pageSize);
  const count = Number(body.count);
  const nextPage =
    list.length > 0 && [page, size, count].every(Number.isFinite) && (page + 1) * size < count ? page + 1 : null;
  return { items, nextPage };
}

function isIroncladUrl(raw: string) {
  try {
    const url = new URL(raw);
    return url.protocol === "https:" && /(^|\.)ironcladapp\.com$/i.test(url.hostname);
  } catch {
    return false;
  }
}
