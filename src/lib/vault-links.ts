// Links to items in a password manager (1Password, Bitwarden, Keeper,
// Dashlane, LastPass, Proton Pass, or any https vault). Consultainer only
// keeps the item's link, a label and a non-secret note — never the secret —
// so everything here is about recognising the vault and refusing anything
// that looks like a secret was pasted instead of a link. Shared by the
// client (live preview while pasting) and the server (the real check).

export type VaultProvider =
  | "ONEPASSWORD"
  | "BITWARDEN"
  | "KEEPER"
  | "DASHLANE"
  | "LASTPASS"
  | "PROTON_PASS"
  | "OTHER";

export const VAULT_PROVIDER_LABELS: Record<VaultProvider, string> = {
  ONEPASSWORD: "1Password",
  BITWARDEN: "Bitwarden",
  KEEPER: "Keeper",
  DASHLANE: "Dashlane",
  LASTPASS: "LastPass",
  PROTON_PASS: "Proton Pass",
  OTHER: "Other vault",
};

export function vaultProviderLabel(provider: string) {
  return VAULT_PROVIDER_LABELS[provider as VaultProvider] ?? VAULT_PROVIDER_LABELS.OTHER;
}

/** "Open in 1Password", or "Open in vault" when we don't know which. */
export function openInLabel(provider: string) {
  const known = VAULT_PROVIDER_LABELS[provider as VaultProvider];
  return known && provider !== "OTHER" ? `Open in ${known}` : "Open in vault";
}

export const VAULT_ITEM_KINDS = [
  { value: "login", label: "Login" },
  { value: "ssh_key", label: "SSH key" },
  { value: "api_key", label: "API key" },
  { value: "document", label: "Document" },
  { value: "other", label: "Other" },
] as const;

export type VaultItemKind = (typeof VAULT_ITEM_KINDS)[number]["value"];

export function itemKindLabel(kind: string | null | undefined) {
  return VAULT_ITEM_KINDS.find((k) => k.value === kind)?.label ?? null;
}

export function isItemKind(value: string): value is VaultItemKind {
  return VAULT_ITEM_KINDS.some((k) => k.value === value);
}

export const SECRET_MESSAGE = "This looks like a secret. Paste the link to the vault item instead.";

export const LABEL_MAX = 120;
export const NOTE_MAX = 1000;
const URL_MAX = 2000;

export type VaultUrlCheck =
  | { ok: true; url: string; provider: VaultProvider }
  | { ok: false; error: string };

// Query/fragment parameter names that carry credentials. 1Password's
// private links use a, v, i and h (account, vault, item, host) — none match.
const SECRET_PARAM = /pass|pwd|secret|token|key|auth|credential|otp|session|signature|^sig$|private|cookie/i;

// Well-known credential shapes, wherever they appear.
const SECRET_PATTERNS: RegExp[] = [
  /-----BEGIN [A-Z0-9 ]*PRIVATE KEY( BLOCK)?-----/,
  /\b(?:AKIA|ASIA|AGPA|AIDA|AROA|ANPA|ANVA|AIPA)[0-9A-Z]{16}\b/, // AWS access key ids
  /\beyJ[\w-]{8,}\.eyJ[\w-]{8,}\.[\w-]{8,}/, // JWT
  /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{30,}/, // GitHub tokens
  /\bgithub_pat_[A-Za-z0-9_]{30,}/,
  /\bglpat-[A-Za-z0-9_-]{20,}/, // GitLab
  /\bxox[abposr]-[A-Za-z0-9-]{10,}/, // Slack
  /\b(?:sk|rk|pk)_(?:live|test)_[A-Za-z0-9]{16,}/, // Stripe
  /\bsk-[A-Za-z0-9_-]{20,}/, // OpenAI / Anthropic style
  /\bAIza[0-9A-Za-z_-]{35}\b/, // Google API key
  /\bnpm_[A-Za-z0-9]{30,}/,
  /\bSG\.[\w-]{16,}\.[\w-]{16,}/, // SendGrid
  /\b(?:password|passwd|passphrase|pwd|pin|secret|api[ _-]?key|access[ _-]?key|secret[ _-]?key|token)\s*[:=]\s*\S+/i,
];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function entropy(s: string) {
  const counts = new Map<string, number>();
  for (const ch of s) counts.set(ch, (counts.get(ch) ?? 0) + 1);
  let bits = 0;
  for (const n of counts.values()) {
    const p = n / s.length;
    bits -= p * Math.log2(p);
  }
  return bits;
}

/** A random-looking run of characters: a generated password, key or token. */
function isHighEntropyToken(token: string) {
  if (token.length < 20 || UUID.test(token)) return false;
  if (!/[0-9]/.test(token) || !/[A-Za-z]/.test(token)) return false;
  const mixedCase = /[a-z]/.test(token) && /[A-Z]/.test(token);
  if (!mixedCase && token.length < 32) return false;
  return entropy(token) >= 3.6;
}

/** Whether free text (a label or note) looks like it contains a credential. */
export function looksLikeSecret(text: string): boolean {
  if (!text) return false;
  if (SECRET_PATTERNS.some((re) => re.test(text))) return true;
  // Words broken on anything that isn't typical of keys/passwords, so URLs,
  // ARNs, emails and paths split into harmless short pieces.
  return text.split(/[^A-Za-z0-9+/=_-]+/).some(isHighEntropyToken);
}

function decode(s: string) {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/** Parameters from the query and from a fragment's own query (`#/vault?itemId=`). */
function urlParams(url: URL): [string, string][] {
  const params = [...url.searchParams.entries()];
  const hash = url.hash.slice(1);
  const q = hash.indexOf("?");
  if (q >= 0) params.push(...new URLSearchParams(hash.slice(q + 1)).entries());
  else if (hash.includes("=")) params.push(...new URLSearchParams(hash).entries());
  return params;
}

function hostIs(host: string, domain: string) {
  return host === domain || host.endsWith(`.${domain}`);
}

const KEEPER_DOMAINS = [
  "keepersecurity.com",
  "keepersecurity.eu",
  "keepersecurity.com.au",
  "keepersecurity.ca",
  "keepersecurity.jp",
  "keepersecurity.us",
];

function detectProvider(url: URL): VaultProvider {
  const host = url.hostname.toLowerCase();
  const hash = url.hash;
  if (["1password.com", "1password.eu", "1password.ca"].some((d) => hostIs(host, d))) return "ONEPASSWORD";
  if (hostIs(host, "bitwarden.com") || hostIs(host, "bitwarden.eu")) return "BITWARDEN";
  // Self-hosted Bitwarden/Vaultwarden: any host, recognised by the web
  // vault's item route.
  if (/^#\/(?:organizations\/[^/?]+\/)?vault\b/.test(hash) && /[?&](?:itemId|cipherId)=/.test(hash)) {
    return "BITWARDEN";
  }
  if (KEEPER_DOMAINS.some((d) => hostIs(host, d))) return "KEEPER";
  if (hostIs(host, "dashlane.com")) return "DASHLANE";
  if (hostIs(host, "lastpass.com") || hostIs(host, "lastpass.eu")) return "LASTPASS";
  if (host === "pass.proton.me") return "PROTON_PASS";
  return "OTHER";
}

/** Share links that hand the item's contents to whoever has the link — the
 * decryption key rides in the URL — so they are secrets themselves. */
function isShareLink(url: URL, provider: VaultProvider) {
  const host = url.hostname.toLowerCase();
  const path = url.pathname.toLowerCase();
  if (provider === "ONEPASSWORD" && (host === "share.1password.com" || path.startsWith("/s/"))) return true;
  if (provider === "BITWARDEN" && (host.startsWith("send.") || /^#\/send\//i.test(url.hash))) return true;
  if (/^#\/send\//i.test(url.hash)) return true; // Self-hosted Bitwarden Send
  if (provider === "KEEPER" && path.includes("/vault/share")) return true;
  if (provider === "PROTON_PASS" && (path.startsWith("/public") || path.startsWith("/share"))) return true;
  // A long random fragment on an unknown vault: most likely a key.
  if (provider === "OTHER") {
    const frag = decode(url.hash.slice(1));
    if (frag.split(/[^A-Za-z0-9+/=_-]+/).some((t) => t.length >= 32 && isHighEntropyToken(t))) return true;
  }
  return false;
}

/** Validates a pasted vault link and works out which password manager it's from. */
export function checkVaultUrl(raw: string): VaultUrlCheck {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: false, error: "Paste the link to the item in your password manager." };
  if (trimmed.length > URL_MAX) return { ok: false, error: "That link is too long." };
  // A pasted secret rather than a link.
  if (SECRET_PATTERNS.some((re) => re.test(trimmed))) return { ok: false, error: SECRET_MESSAGE };
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return {
      ok: false,
      error: looksLikeSecret(trimmed)
        ? SECRET_MESSAGE
        : "Paste a full link to the vault item, starting with https://.",
    };
  }
  if (url.protocol !== "https:") {
    return { ok: false, error: "Only https:// links to a vault item can be added." };
  }
  if (url.username || url.password) return { ok: false, error: SECRET_MESSAGE };
  for (const [name, value] of urlParams(url)) {
    if (SECRET_PARAM.test(name) || SECRET_PATTERNS.some((re) => re.test(value))) {
      return { ok: false, error: SECRET_MESSAGE };
    }
  }
  const provider = detectProvider(url);
  if (isShareLink(url, provider)) {
    return {
      ok: false,
      error:
        "That's a share link — anyone who has it can see the item. Copy the item's private link instead, so only people with access in your vault can open it.",
    };
  }
  return { ok: true, url: url.toString(), provider };
}
