import "server-only";
import { prisma } from "@/lib/prisma";
import { encrypt, decrypt } from "@/lib/crypto";

/** Instance-wide integration credentials an owner can enter in Settings →
 * Integrations instead of the server's .env. An env var, when set, always
 * wins (and shows as read-only in the UI), so existing .env setups keep
 * working unchanged. Values are stored encrypted in InstanceSetting rows. */
export const INTEGRATION_FIELDS = {
  linear: [
    { key: "LINEAR_CLIENT_ID", label: "Client ID", secret: false },
    { key: "LINEAR_CLIENT_SECRET", label: "Client secret", secret: true },
    {
      key: "LINEAR_WEBHOOK_SECRET",
      label: "Webhook signing secret (optional, for live updates)",
      secret: true,
    },
  ],
  googleDrive: [
    { key: "GOOGLE_DRIVE_CLIENT_ID", label: "Client ID", secret: false },
    { key: "GOOGLE_DRIVE_CLIENT_SECRET", label: "Client secret", secret: true },
  ],
  dropbox: [
    { key: "DROPBOX_APP_KEY", label: "App key", secret: false },
    { key: "DROPBOX_APP_SECRET", label: "App secret", secret: true },
  ],
  microsoft: [
    { key: "MICROSOFT_CLIENT_ID", label: "Application (client) ID", secret: false },
    { key: "MICROSOFT_CLIENT_SECRET", label: "Client secret", secret: true },
    { key: "MICROSOFT_TENANT_ID", label: "Directory (tenant) ID — optional, for one organization", secret: false },
  ],
  notion: [
    { key: "NOTION_CLIENT_ID", label: "OAuth client ID", secret: false },
    { key: "NOTION_CLIENT_SECRET", label: "OAuth client secret", secret: true },
  ],
  quickbooks: [
    { key: "QUICKBOOKS_CLIENT_ID", label: "Client ID", secret: false },
    { key: "QUICKBOOKS_CLIENT_SECRET", label: "Client secret", secret: true },
    {
      key: "QUICKBOOKS_ENVIRONMENT",
      label: "Environment",
      secret: false,
      options: ["sandbox", "production"],
    },
  ],
  docusign: [
    { key: "DOCUSIGN_CLIENT_ID", label: "Integration key", secret: false },
    { key: "DOCUSIGN_CLIENT_SECRET", label: "Secret key", secret: true },
    {
      key: "DOCUSIGN_ENVIRONMENT",
      label: "Environment",
      secret: false,
      options: ["demo", "production"],
    },
  ],
  stripe: [
    { key: "STRIPE_SECRET_KEY", label: "Secret key", secret: true },
    { key: "STRIPE_WEBHOOK_SECRET", label: "Webhook signing secret", secret: true },
  ],
  email: [
    { key: "RESEND_API_KEY", label: "Resend API key", secret: true },
    { key: "RESEND_FROM_EMAIL", label: "From address", secret: false },
  ],
} as const satisfies Record<
  string,
  readonly { key: string; label: string; secret: boolean; options?: readonly string[] }[]
>;

export type Integration = keyof typeof INTEGRATION_FIELDS;
export type ConfigKey = (typeof INTEGRATION_FIELDS)[Integration][number]["key"];

const ALL_KEYS = new Set<string>(
  Object.values(INTEGRATION_FIELDS).flatMap((fields) => fields.map((f) => f.key))
);
const ROW_PREFIX = "config:";

// Read on hot paths (every email, every Stripe call), so cache briefly. Saves
// from this process clear it immediately; other processes catch up in ≤15s.
const CACHE_MS = 15_000;
let cache: { at: number; values: Map<string, string> } | null = null;

async function storedValues() {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.values;
  const rows = await prisma.instanceSetting.findMany({
    where: { key: { startsWith: ROW_PREFIX } },
  });
  const values = new Map<string, string>();
  for (const row of rows) {
    try {
      values.set(row.key.slice(ROW_PREFIX.length), decrypt(row.value));
    } catch {
      // Encrypted with a different INTEGRATION_ENCRYPTION_KEY — treat as unset.
    }
  }
  cache = { at: Date.now(), values };
  return values;
}

export async function getConfig(key: ConfigKey): Promise<string | undefined> {
  return process.env[key] || (await storedValues()).get(key) || undefined;
}

export async function getConfigs<K extends ConfigKey>(keys: readonly K[]) {
  const entries = await Promise.all(keys.map(async (k) => [k, await getConfig(k)] as const));
  return Object.fromEntries(entries) as Record<K, string | undefined>;
}

/** What the settings form needs: where each value comes from, and the value
 * itself only for non-secret fields. */
export type FieldDescription = {
  key: ConfigKey;
  label: string;
  secret: boolean;
  options?: string[];
  source: "env" | "db" | null;
  value?: string;
};

export async function describeIntegration(integration: Integration): Promise<FieldDescription[]> {
  const stored = await storedValues();
  return INTEGRATION_FIELDS[integration].map((field) => {
    const source: FieldDescription["source"] = process.env[field.key]
      ? "env"
      : stored.has(field.key)
        ? "db"
        : null;
    const value = source === "env" ? process.env[field.key] : stored.get(field.key);
    return {
      key: field.key,
      label: field.label,
      secret: field.secret,
      options: "options" in field ? ([...field.options] as string[]) : undefined,
      source,
      value: field.secret ? undefined : value,
    };
  });
}

/** Saves values for the given keys. Empty strings delete the stored value
 * (falling back to env, if any); `undefined` leaves it untouched. */
export async function saveConfigs(values: Partial<Record<ConfigKey, string | undefined>>) {
  for (const [key, value] of Object.entries(values)) {
    if (!ALL_KEYS.has(key) || value === undefined) continue;
    const rowKey = ROW_PREFIX + key;
    if (value === "") {
      await prisma.instanceSetting.deleteMany({ where: { key: rowKey } });
    } else {
      await prisma.instanceSetting.upsert({
        where: { key: rowKey },
        create: { key: rowKey, value: encrypt(value) },
        update: { value: encrypt(value) },
      });
    }
  }
  cache = null;
}
