import "server-only";
import http from "node:http";
import https from "node:https";
import { lookup as dnsLookup, type LookupAddress } from "node:dns";
import { isIP, BlockList } from "node:net";

// Fetching a URL a user typed in (calendar links, Slack webhooks) must not let them reach
// this server's own network: loopback, private ranges, link-local (cloud
// metadata), etc. Addresses are checked at connect time, via the socket's
// own DNS lookup, so a hostname can't pass a check and then resolve
// somewhere else (DNS rebinding). Redirects are followed by hand and
// re-checked.

export class SafeFetchError extends Error {}

const blocked = new BlockList();
for (const [net, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const) {
  blocked.addSubnet(net, prefix, "ipv4");
}
for (const [net, prefix] of [
  ["::", 128],
  ["::1", 128],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
  ["64:ff9b::", 96],
  ["2001:db8::", 32],
] as const) {
  blocked.addSubnet(net, prefix, "ipv6");
}

// Self-hosted setups whose calendars live on the same private network
// (e.g. Nextcloud on a LAN) can opt out of the private-range block.
const allowPrivate = () => process.env.ALLOW_PRIVATE_FETCH === "true";

export function isBlockedAddress(address: string) {
  if (allowPrivate()) return false;
  const family = isIP(address);
  if (family === 0) return true;
  if (family === 6) {
    // IPv4-mapped (::ffff:10.0.0.1) — judge the IPv4 address.
    const mapped = address.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
    if (mapped) return blocked.check(mapped[1], "ipv4");
    return blocked.check(address, "ipv6");
  }
  return blocked.check(address, "ipv4");
}

const safeLookup: typeof dnsLookup = ((
  hostname: string,
  options: object,
  callback: (err: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void
) => {
  dnsLookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return callback(err, "");
    const list = addresses as LookupAddress[];
    const allowed = list.filter((a) => !isBlockedAddress(a.address));
    if (allowed.length === 0) {
      return callback(
        Object.assign(new Error("That address isn't reachable from here."), { code: "EBLOCKED" }),
        ""
      );
    }
    if ((options as { all?: boolean }).all) return callback(null, allowed);
    callback(null, allowed[0].address, allowed[0].family);
  });
}) as typeof dnsLookup;

/** webcal:// → https://, and only http(s) to public hosts. */
export function normalizePublicUrl(raw: string) {
  let url: URL;
  try {
    url = new URL(raw.trim().replace(/^webcals?:\/\//i, "https://"));
  } catch {
    throw new SafeFetchError("That isn't a valid link.");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new SafeFetchError("Use an https:// (or webcal://) link.");
  }
  if (url.username || url.password) throw new SafeFetchError("Links with a username or password aren't supported.");
  if (isIP(url.hostname.replace(/^\[|\]$/g, "")) && isBlockedAddress(url.hostname.replace(/^\[|\]$/g, ""))) {
    throw new SafeFetchError("That address isn't reachable from here.");
  }
  if (!allowPrivate() && /^(localhost|.*\.local|.*\.internal)$/i.test(url.hostname)) {
    throw new SafeFetchError("That address isn't reachable from here.");
  }
  return url;
}

/** GET a public URL as text, with a size cap, timeout and checked redirects. */
export async function fetchPublicText(
  raw: string,
  opts: { maxBytes?: number; timeoutMs?: number; maxRedirects?: number } = {}
): Promise<string> {
  const maxBytes = opts.maxBytes ?? 10 * 1024 * 1024;
  const timeoutMs = opts.timeoutMs ?? 15_000;
  let url = normalizePublicUrl(raw);

  for (let hop = 0; hop <= (opts.maxRedirects ?? 3); hop++) {
    const result = await requestOnce(url, {
      method: "GET",
      headers: { "User-Agent": "Consultainer calendar sync", Accept: "text/calendar, */*" },
      maxBytes,
      timeoutMs,
      what: "the calendar server",
      tooLarge: "The calendar is too large.",
    });
    if (result.redirect) {
      url = normalizePublicUrl(new URL(result.redirect, url).toString());
      continue;
    }
    return result.body!;
  }
  throw new SafeFetchError("Too many redirects.");
}

/** POST a JSON body to a public URL (e.g. a Slack webhook). Redirects aren't
 * followed; resolves once the server answers 2xx, else throws SafeFetchError. */
export async function postPublicJson(
  raw: string,
  payload: unknown,
  opts: { timeoutMs?: number } = {}
): Promise<void> {
  const url = normalizePublicUrl(raw);
  const body = JSON.stringify(payload);
  const result = await requestOnce(url, {
    method: "POST",
    headers: {
      "User-Agent": "Consultainer",
      "Content-Type": "application/json",
      "Content-Length": String(Buffer.byteLength(body)),
    },
    body,
    maxBytes: 64 * 1024,
    timeoutMs: opts.timeoutMs ?? 5_000,
    what: "the server",
    tooLarge: "The server's response is too large.",
  });
  if (result.redirect) throw new SafeFetchError("The server answered with a redirect.");
}

function requestOnce(
  url: URL,
  opts: {
    method: "GET" | "POST";
    headers: Record<string, string>;
    body?: string;
    maxBytes: number;
    timeoutMs: number;
    /** For error messages: "the calendar server", "the server". */
    what: string;
    tooLarge: string;
  }
): Promise<{ redirect?: string; body?: string }> {
  const { maxBytes, timeoutMs, what } = opts;
  const What = what[0].toUpperCase() + what.slice(1);
  return new Promise((resolve, reject) => {
    const client = url.protocol === "https:" ? https : http;
    const req = client.request(
      url,
      {
        method: opts.method,
        lookup: safeLookup,
        timeout: timeoutMs,
        headers: opts.headers,
      },
      (res) => {
        const status = res.statusCode ?? 0;
        if (status >= 300 && status < 400 && res.headers.location) {
          res.resume();
          return resolve({ redirect: res.headers.location });
        }
        if (status < 200 || status >= 300) {
          res.resume();
          return reject(new SafeFetchError(`${What} answered ${status}.`));
        }
        const chunks: Buffer[] = [];
        let size = 0;
        res.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > maxBytes) {
            req.destroy();
            reject(new SafeFetchError(opts.tooLarge));
            return;
          }
          chunks.push(chunk);
        });
        res.on("end", () => resolve({ body: Buffer.concat(chunks).toString("utf8") }));
        res.on("error", reject);
      }
    );
    req.on("timeout", () => req.destroy(new SafeFetchError(`${What} took too long.`)));
    req.on("error", (err: NodeJS.ErrnoException) => {
      if (err instanceof SafeFetchError) return reject(err);
      if (err.code === "EBLOCKED") return reject(new SafeFetchError(err.message));
      reject(new SafeFetchError(`Couldn't reach ${what} (${err.code ?? err.message}).`));
    });
    req.end(opts.body);
  });
}
