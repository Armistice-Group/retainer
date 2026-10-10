// A small streaming ZIP writer (no dependency: the app doesn't ship one).
// Entries are deflated with Node's zlib. Data that's already in memory gets
// its sizes and CRC in the local header; streamed data (CSV/JSON built row by
// row) uses a data descriptor after it instead. ZIP64 records are added when
// offsets, sizes or the entry count outgrow the classic format, so archives
// over 4 GB still open. Names are UTF-8 (general purpose bit 11).
import { Readable } from "stream";
import { createDeflateRaw, deflateRawSync } from "zlib";

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(data: Uint8Array, crc = 0): number {
  let c = ~crc >>> 0;
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return ~c >>> 0;
}

export type ZipEntry = {
  name: string;
  /** Whole file in memory, or a stream of chunks (strings are UTF-8). */
  data: Uint8Array | AsyncIterable<Uint8Array | string>;
  modified?: Date;
};

type CentralRecord = {
  name: Buffer;
  crc: number;
  compressedSize: number;
  size: number;
  offset: number;
  flags: number;
  time: number;
  date: number;
};

const MAX32 = 0xffffffff;
const MAX16 = 0xffff;

function dosDateTime(d: Date) {
  const year = Math.max(1980, d.getFullYear());
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2),
    date: ((year - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

function localHeader(r: Omit<CentralRecord, "offset">) {
  const h = Buffer.alloc(30);
  h.writeUInt32LE(0x04034b50, 0);
  h.writeUInt16LE(20, 4); // version needed: 2.0 (deflate)
  h.writeUInt16LE(r.flags, 6);
  h.writeUInt16LE(8, 8); // deflate
  h.writeUInt16LE(r.time, 10);
  h.writeUInt16LE(r.date, 12);
  h.writeUInt32LE(r.crc, 14);
  h.writeUInt32LE(r.compressedSize, 18);
  h.writeUInt32LE(r.size, 22);
  h.writeUInt16LE(r.name.length, 26);
  h.writeUInt16LE(0, 28);
  return Buffer.concat([h, r.name]);
}

function centralHeader(r: CentralRecord, forceZip64: boolean) {
  const needs64 = forceZip64 || r.offset >= MAX32;
  const extra = needs64 ? Buffer.alloc(12) : Buffer.alloc(0);
  if (needs64) {
    extra.writeUInt16LE(0x0001, 0);
    extra.writeUInt16LE(8, 2);
    extra.writeBigUInt64LE(BigInt(r.offset), 4);
  }
  const h = Buffer.alloc(46);
  h.writeUInt32LE(0x02014b50, 0);
  h.writeUInt16LE((3 << 8) | 45, 4); // made by: Unix, 4.5
  h.writeUInt16LE(needs64 ? 45 : 20, 6);
  h.writeUInt16LE(r.flags, 8);
  h.writeUInt16LE(8, 10);
  h.writeUInt16LE(r.time, 12);
  h.writeUInt16LE(r.date, 14);
  h.writeUInt32LE(r.crc, 16);
  h.writeUInt32LE(r.compressedSize, 20);
  h.writeUInt32LE(r.size, 24);
  h.writeUInt16LE(r.name.length, 28);
  h.writeUInt16LE(extra.length, 30);
  h.writeUInt16LE(0, 32); // comment
  h.writeUInt16LE(0, 34); // disk
  h.writeUInt16LE(0, 36); // internal attrs
  h.writeUInt32LE((0o100644 << 16) >>> 0, 38); // -rw-r--r--
  h.writeUInt32LE(needs64 ? MAX32 : r.offset, 42);
  return Buffer.concat([h, r.name, extra]);
}

function endRecords(count: number, cdOffset: number, cdSize: number, forceZip64: boolean) {
  const parts: Buffer[] = [];
  const needs64 = forceZip64 || count >= MAX16 || cdOffset >= MAX32 || cdSize >= MAX32;
  if (needs64) {
    const z = Buffer.alloc(56);
    z.writeUInt32LE(0x06064b50, 0);
    z.writeBigUInt64LE(BigInt(44), 4);
    z.writeUInt16LE((3 << 8) | 45, 12);
    z.writeUInt16LE(45, 14);
    z.writeUInt32LE(0, 16);
    z.writeUInt32LE(0, 20);
    z.writeBigUInt64LE(BigInt(count), 24);
    z.writeBigUInt64LE(BigInt(count), 32);
    z.writeBigUInt64LE(BigInt(cdSize), 40);
    z.writeBigUInt64LE(BigInt(cdOffset), 48);
    const loc = Buffer.alloc(20);
    loc.writeUInt32LE(0x07064b50, 0);
    loc.writeUInt32LE(0, 4);
    loc.writeBigUInt64LE(BigInt(cdOffset + cdSize), 8);
    loc.writeUInt32LE(1, 16);
    parts.push(z, loc);
  }
  const e = Buffer.alloc(22);
  e.writeUInt32LE(0x06054b50, 0);
  e.writeUInt16LE(0, 4);
  e.writeUInt16LE(0, 6);
  e.writeUInt16LE(Math.min(count, MAX16), 8);
  e.writeUInt16LE(Math.min(count, MAX16), 10);
  e.writeUInt32LE(needs64 ? MAX32 : cdSize, 12);
  e.writeUInt32LE(needs64 ? MAX32 : cdOffset, 16);
  e.writeUInt16LE(0, 20);
  parts.push(e);
  return Buffer.concat(parts);
}

/** Zip-safe path: forward slashes, no leading slash or "..", no control chars. */
export function safeZipPath(path: string) {
  return path
    .replace(/\\/g, "/")
    .split("/")
    .map((seg) => seg.replace(/[\x00-\x1f\x7f:*?"<>|]/g, "_").trim())
    .filter((seg) => seg && seg !== "." && seg !== "..")
    .join("/")
    .slice(0, 400);
}

/**
 * Yields the bytes of a ZIP archive holding `entries`, one entry at a time —
 * nothing but the current entry (and the small central directory) is held
 * in memory. Each entry's single-file limit is 4 GB.
 */
export async function* zipStream(
  entries: AsyncIterable<ZipEntry> | Iterable<ZipEntry>,
  options: { forceZip64?: boolean } = {}
): AsyncGenerator<Buffer> {
  const records: CentralRecord[] = [];
  const usedNames = new Set<string>();
  let offset = 0;

  for await (const entry of entries) {
    let name = safeZipPath(entry.name) || "file";
    // Duplicate names: "a.pdf" → "a (2).pdf".
    if (usedNames.has(name)) {
      const dot = name.lastIndexOf(".");
      const [stem, ext] = dot > name.lastIndexOf("/") ? [name.slice(0, dot), name.slice(dot)] : [name, ""];
      let n = 2;
      while (usedNames.has(`${stem} (${n})${ext}`)) n++;
      name = `${stem} (${n})${ext}`;
    }
    usedNames.add(name);
    const nameBytes = Buffer.from(name, "utf8");
    const { time, date } = dosDateTime(entry.modified ?? new Date());
    const start = offset;

    if (entry.data instanceof Uint8Array) {
      if (entry.data.length >= MAX32) throw new Error(`${name} is too large for the archive (4 GB limit).`);
      const compressed = deflateRawSync(entry.data);
      const rec = {
        name: nameBytes,
        crc: crc32(entry.data),
        compressedSize: compressed.length,
        size: entry.data.length,
        flags: 0x0800,
        time,
        date,
      };
      const header = localHeader(rec);
      yield header;
      yield compressed;
      offset += header.length + compressed.length;
      records.push({ ...rec, offset: start });
      continue;
    }

    // Streamed: sizes and CRC follow the data (flag bit 3).
    const rec = { name: nameBytes, crc: 0, compressedSize: 0, size: 0, flags: 0x0808, time, date };
    const header = localHeader(rec);
    yield header;
    offset += header.length;

    let crc = 0;
    let size = 0;
    const source = entry.data;
    const input = Readable.from(
      (async function* () {
        for await (const chunk of source) {
          const bytes = typeof chunk === "string" ? Buffer.from(chunk, "utf8") : Buffer.from(chunk);
          crc = crc32(bytes, crc);
          size += bytes.length;
          yield bytes;
        }
      })()
    );
    const deflate = createDeflateRaw();
    input.pipe(deflate);
    input.on("error", (err) => deflate.destroy(err));
    let compressedSize = 0;
    for await (const out of deflate as AsyncIterable<Buffer>) {
      compressedSize += out.length;
      yield out;
    }
    if (size >= MAX32 || compressedSize >= MAX32) {
      throw new Error(`${name} is too large for the archive (4 GB limit).`);
    }
    const descriptor = Buffer.alloc(16);
    descriptor.writeUInt32LE(0x08074b50, 0);
    descriptor.writeUInt32LE(crc, 4);
    descriptor.writeUInt32LE(compressedSize, 8);
    descriptor.writeUInt32LE(size, 12);
    yield descriptor;
    offset += compressedSize + descriptor.length;
    records.push({ ...rec, crc, compressedSize, size, offset: start });
  }

  const cdOffset = offset;
  let cdSize = 0;
  for (const r of records) {
    const h = centralHeader(r, !!options.forceZip64);
    cdSize += h.length;
    yield h;
  }
  yield endRecords(records.length, cdOffset, cdSize, !!options.forceZip64);
}

/** zipStream as a web ReadableStream (for a Response body), pulled on demand. */
export function zipReadableStream(
  entries: AsyncIterable<ZipEntry> | Iterable<ZipEntry>,
  options: { forceZip64?: boolean; onError?: (err: unknown) => void } = {}
): ReadableStream<Uint8Array> {
  const it = zipStream(entries, options);
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { value, done } = await it.next();
        if (done) controller.close();
        else controller.enqueue(new Uint8Array(value.buffer, value.byteOffset, value.byteLength));
      } catch (err) {
        options.onError?.(err);
        controller.error(err);
      }
    },
    async cancel() {
      await it.return(undefined);
    },
  });
}
