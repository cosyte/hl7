/**
 * What `parseStream()` gives a caller, held to digests recorded before its reading loop was
 * rewritten to hold less memory. Over a corpus of a few hundred synthetic streams (generated from a
 * seed, plus hand-made edge cases) each read as text and as bytes, whole and cut into chunks of
 * several sizes, this records every entry it yields: its own keys, `ok`, `raw`, the position, the
 * stream warnings, the parsed message (serialized, as JSON, its warnings in order with their
 * positions, its own keys, a field read and `util.inspect`), or the error (code, message,
 * position, snippet, own keys), and any error the stream itself throws. Each input's record is
 * hashed and compared with the stored digest.
 *
 * A digest that moves means something a caller sees has changed. The digests are rewritten only
 * when `HL7_STREAM_EQUIVALENCE_WRITE=1` is set, which no CI job sets. Every value here is synthetic.
 */

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { inspect } from "node:util";
import { Buffer } from "node:buffer";

import { describe, expect, it } from "vitest";

import { defineProfile, parseStream } from "../src/index.js";
import type { ParseOptions, Profile, StreamMessageEntry } from "../src/index.js";

const DIGESTS = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "fixtures",
  "stream",
  "equivalence-digests.json",
);
const WRITE = process.env["HL7_STREAM_EQUIVALENCE_WRITE"] === "1";

/** A small deterministic generator (mulberry32), so the corpus is the same on every run. */
function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const VENDOR = defineProfile({
  name: "equivalence-vendor",
  customSegments: { ZDP: { fields: { departmentCode: 3 } } },
});

const CHARSETS = [
  "",
  "UNICODE UTF-8",
  "8859/1",
  "WINDOWS-1252",
  "8859/2",
  "8859/9",
  "UNICODE UTF-16",
  "FAKE-SET",
  "ASCII",
] as const;

/** The bytes of one synthetic message's segments, before terminators are chosen. */
function messageSegments(rand: () => number, id: number): Buffer[] {
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)] as T;
  const charset = pick(CHARSETS);
  const kind = pick(["ADT^A01", "ORU^R01", "ORU^R01", "ADT^A08", "ZZZ^Z99"]);
  const control = `C${String(id).padStart(5, "0")}`;
  const msh18 = charset === "" ? "" : `||||||${charset}`;
  const segs: Buffer[] = [];
  const ascii = (s: string): Buffer => Buffer.from(s, "latin1");
  if (rand() < 0.04) {
    segs.push(ascii("MSH|^")); // too short: a fatal
  } else {
    segs.push(
      ascii(
        `MSH|^~\\&|SENDAPP|SENDFAC|RECVAPP|RECVFAC|20260101120000||${kind}|${control}|P|2.5${msh18}`,
      ),
    );
  }
  segs.push(ascii("EVN|A01|20260101120000"));
  // The name: plain, Latin-1 letters, UTF-8 letters, C1 bytes, or bytes no UTF-8 decoder accepts.
  const nameKind = pick(["plain", "plain", "latin1", "utf8", "c1", "invalid"]);
  const family =
    nameKind === "latin1"
      ? Buffer.from([0x54, 0x65, 0x73, 0x74, 0xe9]) // "Test" and e acute in Latin-1
      : nameKind === "utf8"
        ? Buffer.from(`Test${String.fromCharCode(0xe9, 0x4e2d)}`, "utf8")
        : nameKind === "c1"
          ? Buffer.from([0x54, 0x65, 0x73, 0x74, 0x80, 0x93, 0x9f])
          : nameKind === "invalid"
            ? Buffer.from([0x54, 0x65, 0x73, 0x74, 0xc3, 0x28, 0xff])
            : ascii("Testpatient");
  const pad = rand() < 0.2 ? "  " : "";
  segs.push(
    Buffer.concat([
      ascii(`PID|1||FAKE${String(id).padStart(6, "0")}^^^HOSP^MR||${pad}`),
      family,
      ascii(`^Alpha^Q${pad}||19800101|F`),
    ]),
  );
  if (rand() < 0.3) segs.push(ascii(`PV1|1|I|WARD^${String(id % 90)}^A`));
  const obx = Math.floor(rand() * 4);
  if (kind.startsWith("ORU")) {
    segs.push(ascii("OBR|1||ACC000001|CBC^Complete Blood Count^LN|||20260101120000"));
    for (let k = 0; k < obx; k++) {
      const big = rand() < 0.15;
      const value = big
        ? `^AP^PDF^Base64^${"QUJD".repeat(1 + Math.floor(rand() * 600))}`
        : String(70 + Math.floor(rand() * 60));
      segs.push(
        ascii(`OBX|${String(k + 1)}|${big ? "ED" : "NM"}|GLU^Glucose^LN||${value}|mg/dL|||||F`),
      );
    }
  }
  if (rand() < 0.25) segs.push(ascii("NTE|1||A note with \\F\\ a field mark and \\X41\\ hex\\"));
  if (rand() < 0.2) segs.push(ascii(`ZDP|1||DEPT${String(id % 7)}`));
  if (rand() < 0.1) segs.push(ascii("obx|9|ST|LOWER^Lowercase name||value"));
  if (rand() < 0.1) segs.push(ascii("   ")); // whitespace inside a message
  if (rand() < 0.1) segs.push(ascii("")); // an empty segment inside a message
  return segs;
}

/** One synthetic stream: messages, envelopes, blank lines and noise, as bytes. */
function generatedStream(seed: number): Buffer {
  const rand = prng(seed);
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)] as T;
  const term = (): string => pick(["\r", "\r", "\r", "\n", "\r\n"]);
  const parts: Buffer[] = [];
  const line = (b: Buffer): void => {
    parts.push(b, Buffer.from(term(), "latin1"));
  };
  if (rand() < 0.08) parts.push(Buffer.from([0xef, 0xbb, 0xbf]));
  if (rand() < 0.08) line(Buffer.from("stray text before any header", "latin1"));
  const batched = rand() < 0.2;
  if (batched) {
    line(Buffer.from("FHS|^~\\&|SENDAPP", "latin1"));
    line(Buffer.from("BHS|^~\\&|SENDAPP", "latin1"));
  }
  const count = 1 + Math.floor(rand() * 5);
  for (let m = 0; m < count; m++) {
    const segs = messageSegments(rand, seed * 10 + m);
    const framed = rand() < 0.08;
    if (framed) parts.push(Buffer.from([0x0b]));
    segs.forEach((s, i) => {
      if (framed && i === segs.length - 1) {
        parts.push(s, Buffer.from([0x1c, 0x0d]));
      } else line(s);
    });
    if (rand() < 0.2) line(Buffer.from(pick(["", " ", "\t"]), "latin1"));
  }
  if (batched) {
    line(Buffer.from(`BTS|${String(count)}`, "latin1"));
    line(Buffer.from("FTS|1", "latin1"));
  }
  let out = Buffer.concat(parts);
  // Sometimes the stream ends without its last terminator, or on a lone CR, or on blank text.
  const ending = rand();
  if (ending < 0.15) {
    while (out.length > 0 && (out[out.length - 1] === 0x0d || out[out.length - 1] === 0x0a)) {
      out = out.subarray(0, out.length - 1);
    }
  } else if (ending < 0.2) {
    out = Buffer.concat([out, Buffer.from("  ", "latin1")]);
  }
  return out;
}

/** A byte order mark in text, and the same mark's three bytes read one byte to one character. */
const BOM = String.fromCharCode(0xfeff);
const LATIN1_BOM = String.fromCharCode(0xef, 0xbb, 0xbf);

/** Hand-made streams: the edges a generator reaches rarely. */
const HAND_MADE: readonly string[] = [
  "",
  "\r",
  "\r\n",
  "\n\n\n",
  "MSH|^~\\&|A|F|B|G|20260101||ADT^A01|1|P|2.5",
  "MSH|^~\\&|A|F|B|G|20260101||ADT^A01|1|P|2.5\r",
  "MSH|^~\\&|A|F|B|G|20260101||ADT^A01|1|P|2.5\r\n",
  "MSH|^~\\&|A|F|B|G|20260101||ADT^A01|1|P|2.5\n\rPID|1||FAKE1\r\r",
  BOM + "MSH|^~\\&|A|F|B|G|20260101||ADT^A01|1|P|2.5\rPID|1||FAKE1\r",
  LATIN1_BOM + "MSH|^~\\&|A|F|B|G|20260101||ADT^A01|1|P|2.5\rPID|1||FAKE1\r",
  LATIN1_BOM.slice(0, 2) + "MSH|^~\\&|A|F|B|G|20260101||ADT^A01|1|P|2.5\r",
  LATIN1_BOM.slice(0, 1),
  LATIN1_BOM.slice(0, 2),
  LATIN1_BOM,
  BOM,
  "PID|1||FAKE1\rMSH|^~\\&|A|F|B|G|20260101||ADT^A01|1|P|2.5\r",
  "FHS|^~\\&\rBHS|^~\\&\rBTS|0\rFTS|1\r",
  "BHS|^~\\&\rMSH|^~\\&|A|F|B|G|20260101||ADT^A01|1|P|2.5\rBTS|1\rtrailing",
  "MSH|^~\\&|A|F|B|G|20260101||ADT^A01|1|P|2.5\rPID|1||FAKE1\rMSH|^\rMSH|^~\\&|A|F|B|G|20260101||ADT^A01|3|P|2.5\r",
  "\u000bMSH|^~\\&|A|F|B|G|20260101||ADT^A01|1|P|2.5\rPID|1||FAKE1\u001c\r\u000bMSH|^~\\&|A|F|B|G|20260101||ADT^A01|2|P|2.5\u001c\r",
  "MSH|^~\\&|A|F|B|G|20260101||ADT^A01|1|P|2.5|||||||UNICODE UTF-8\rPID|1||FAKE1||Doe" +
    String.fromCharCode(0xc3, 0xa9) +
    "\r",
  "MSH|^~\\&|A|F|B|G|20260101||ADT^A01|1|P|2.5\r   \r\t\rMSH|^~\\&|A|F|B|G|20260101||ADT^A01|2|P|2.5\r  ",
  "MSH|^~\\&|A|F|B|G|20260101||ADT^A01|1|P|2.5\rPID|1||FAKE1\r\rMSH|^~\\&|A|F|B|G|20260101||ADT^A01|2|P|2.5",
  `MSH|^~\\&|A|F|B|G|20260101||ORU^R01|1|P|2.5\rOBX|1|ED|DOC^Doc^LN||^AP^PDF^Base64^${"QUJD".repeat(5000)}||||||F\rMSH|^~\\&|A|F|B|G|20260101||ADT^A01|2|P|2.5\r`,
];

type Chunk = string | Uint8Array;

/** `whole` cut into pieces: fixed sizes, or the given cut points. */
function cut<T extends Chunk>(whole: T, size: number): T[] {
  const out: T[] = [];
  if (whole.length === 0) return out;
  for (let i = 0; i < whole.length; i += size) out.push(whole.slice(i, i + size) as T);
  return out;
}

function cutRandom<T extends Chunk>(whole: T, rand: () => number): T[] {
  const out: T[] = [];
  let i = 0;
  while (i < whole.length) {
    const n = 1 + Math.floor(rand() * 40);
    out.push(whole.slice(i, i + n) as T);
    i += n;
  }
  return out;
}

/** An async source over `chunks`, sometimes with an empty chunk between them. */
async function* asyncSource(chunks: readonly unknown[], empties: boolean): AsyncGenerator<unknown> {
  for (const c of chunks) {
    await Promise.resolve();
    if (empties) yield typeof c === "string" ? "" : new Uint8Array(0);
    yield c;
  }
}

/** Every own key, symbols as their description. */
function keys(value: object): string[] {
  return Reflect.ownKeys(value).map((k) =>
    typeof k === "symbol" ? `@@${String(k.description)}` : k,
  );
}

/** What a caller can see of one entry. */
function recordEntry(entry: StreamMessageEntry): unknown {
  const base = {
    keys: keys(entry),
    frozen: Object.isFrozen(entry),
    ok: entry.ok,
    raw: entry.raw,
    rawType: typeof entry.raw,
    position: JSON.stringify(entry.position),
    positionFrozen: Object.isFrozen(entry.position),
    streamWarnings: entry.streamWarnings.map((w) => ({ keys: keys(w), json: JSON.stringify(w) })),
    streamWarningsFrozen: Object.isFrozen(entry.streamWarnings),
    entryJson: JSON.stringify(entry, (k, v: unknown) => (k === "message" ? "[message]" : v)),
  };
  if (entry.ok) {
    const m = entry.message;
    // inspect first: it reads every own property, which builds what is still pending.
    const inspected = inspect(m, { depth: 6, breakLength: 120 });
    return {
      ...base,
      inspected,
      messageKeys: keys(m),
      version: m.version,
      encoding: JSON.stringify(m.encodingCharacters),
      warnings: m.warnings.map((w) => ({
        keys: keys(w),
        json: JSON.stringify(w),
        message: w.message,
      })),
      pid: m.get("PID.3.1"),
      name: m.get("PID.5.1"),
      serialized: m.toString(),
      json: JSON.stringify(m),
    };
  }
  const e = entry.error;
  return {
    ...base,
    errorName: e.name,
    errorKeys: keys(e),
    code: e.code,
    message: e.message,
    errorPosition: JSON.stringify(e.position),
    snippet: e.snippet,
    errorJson: JSON.stringify(e),
  };
}

/** Read `source` to the end and record everything it yields and any error it throws. */
async function record(
  source: unknown,
  optionsOrProfile: ParseOptions | Profile | undefined,
): Promise<unknown> {
  const entries: unknown[] = [];
  try {
    const gen =
      optionsOrProfile === undefined
        ? parseStream(source as Iterable<string>)
        : parseStream(source as Iterable<string>, optionsOrProfile as ParseOptions);
    for await (const entry of gen) entries.push(recordEntry(entry));
    return { entries };
  } catch (error) {
    const e = error as Error;
    return { entries, thrown: { name: e.name, message: e.message } };
  }
}

const OPTION_SETS: readonly (ParseOptions | Profile | undefined)[] = [
  undefined,
  undefined,
  undefined,
  { strict: true },
  { lazy: false },
  { charset: "8859/1" },
  { charset: "UNICODE UTF-8" },
  VENDOR,
  { trimFields: false },
  { stripMllpFraming: false },
];

/** Every way one input is read: as text and as bytes, whole and in chunks of several sizes. */
async function readAllWays(bytes: Buffer, seed: number): Promise<unknown[]> {
  const rand = prng(seed ^ 0x5bd1e995);
  const options = OPTION_SETS[seed % OPTION_SETS.length];
  const latin1 = bytes.toString("latin1");
  const utf8 = bytes.toString("utf8");
  const sizes = [1, 2, 3, 7, 64, 4096];
  const size = sizes[seed % sizes.length] as number;
  const out: unknown[] = [];
  out.push(await record([latin1], options));
  out.push(await record(asyncSource(cut(latin1, size), seed % 3 === 0), options));
  out.push(await record(cutRandom(utf8, rand), options));
  out.push(await record([bytes], options));
  out.push(await record(asyncSource(cut(bytes, size), seed % 4 === 0), options));
  out.push(await record(cutRandom(new Uint8Array(bytes), rand), options));
  return out;
}

function digest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

const GENERATED = 300;

/**
 * The digests are a Node.js reading. Bun's `util.inspect` and its Error objects are its own, so the
 * same entries read there do not hash the same; the rest of the stream suite runs under Bun.
 */
const ON_BUN = process.versions["bun"] !== undefined;

describe.skipIf(ON_BUN)("parseStream: what a caller sees is unchanged", () => {
  it("matches the recorded digest for every input, read every way", async () => {
    const digests: Record<string, string> = {};
    for (let n = 0; n < GENERATED; n++) {
      digests[`generated-${String(n)}`] = digest(await readAllWays(generatedStream(n), n));
    }
    for (let i = 0; i < HAND_MADE.length; i++) {
      const bytes = Buffer.from(HAND_MADE[i] as string, "latin1");
      const ways = await readAllWays(bytes, i);
      // A text source with a real U+FEFF, which latin1 bytes cannot carry.
      ways.push(await record([HAND_MADE[i] as string], undefined));
      ways.push(await record(cut(HAND_MADE[i] as string, 1), undefined));
      digests[`hand-made-${String(i)}`] = digest(ways);
    }
    // Mixed chunks, and sources that are not chunks at all.
    const misuse = [
      await record(
        ["MSH|^~\\&|A|F|B|G|20260101||ADT^A01|1|P|2.5\r", Buffer.from("PID|1\r")],
        undefined,
      ),
      await record(
        [Buffer.from("MSH|^~\\&|A|F|B|G|20260101||ADT^A01|1|P|2.5\r"), "PID|1\r"],
        undefined,
      ),
      await record(["MSH|^~\\&|A|F|B|G|20260101||ADT^A01|1|P|2.5\rMSH|^~\\&|A\r", 42], undefined),
      await record("MSH|^~\\&|A", undefined),
      await record(Buffer.from("MSH|^~\\&|A"), undefined),
      await record(null, undefined),
      await record({}, undefined),
      await record([null], undefined),
    ];
    digests["misuse"] = digest(misuse);

    if (WRITE) {
      writeFileSync(DIGESTS, `${JSON.stringify(digests, null, 2)}\n`);
      return;
    }
    const stored = JSON.parse(readFileSync(DIGESTS, "utf8")) as Record<string, string>;
    expect(Object.keys(digests)).toEqual(Object.keys(stored));
    const moved = Object.keys(digests).filter((k) => digests[k] !== stored[k]);
    expect(moved).toEqual([]);
  }, 120_000);
});
