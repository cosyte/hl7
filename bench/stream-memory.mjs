// How much memory the streaming readers hold, against the largest item they read: the reading
// that shows `readMessages` holds about one message, and `readSegments` about one segment, however
// large the source is.
//
//   pnpm build && node bench/stream-memory.mjs --target dist/index.mjs --mib 100 \
//     --out stream-memory.json --summary stream-memory.md
//
// The 100 MiB reading runs on a GitHub-hosted runner, in the bench-reading workflow, never on a
// shared developer machine; `--mib 1` is a quick local check. Every message is synthetic and built
// here from an index, as the source produces it: the source is a generator of 64 KiB chunks, so
// the batch is never held whole by anything but the reader under test.
//
// Each reader reads its source three times: a short read to warm it up, a timed read with no
// collection forced, then a read that takes a full collection every few items and reads the heap
// and the array buffers. `peak` is the most they held above the reading taken before that read.

import { performance } from "node:perf_hooks";
import { parseArgs } from "node:util";
import { writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { setFlagsFromString } from "node:v8";
import { runInNewContext } from "node:vm";
import { resolve } from "node:path";

import { adtMessage, documentMessage, oruMessage } from "./parse.bench.mjs";

const MIB = 1024 * 1024;
const CHUNK = 64 * 1024;

const { values } = parseArgs({
  options: {
    target: { type: "string", default: "dist/index.mjs" },
    mib: { type: "string", default: "1" },
    out: { type: "string" },
    summary: { type: "string" },
  },
});

// A full collection before each reading, as test/perf/parse-memory.perf.ts takes one.
setFlagsFromString("--expose-gc");
const gc = runInNewContext("gc");

const hl7 = await import(pathToFileURL(resolve(values.target)).href);
const total = Number(values.mib) * MIB;

/** Heap and array buffers held now, after a full collection. */
function held() {
  gc();
  const usage = process.memoryUsage();
  return usage.heapUsed + usage.arrayBuffers;
}

/**
 * The bytes of `count` messages, in 64 KiB chunks: mostly ADT^A01, a 32 KiB ORU^R01 every 50th,
 * and a 4 MiB message carrying a base64 document every 2000th. Calls `largest` with each message's
 * size.
 */
async function* batchChunks(bytes, onMessage) {
  let pending = Buffer.alloc(0);
  for (let i = 0, sent = 0; sent < bytes; i++) {
    const text =
      i % 2000 === 1999
        ? documentMessage(i, 4 * MIB)
        : i % 50 === 49
          ? oruMessage(i, 32 * 1024)
          : adtMessage(i);
    const message = Buffer.from(text, "latin1");
    onMessage(message.length);
    sent += message.length;
    pending = pending.length === 0 ? message : Buffer.concat([pending, message]);
    while (pending.length >= CHUNK) {
      yield pending.subarray(0, CHUNK);
      pending = pending.subarray(CHUNK);
    }
  }
  if (pending.length > 0) yield pending;
}

/** One ORU^R01 of about `bytes` bytes, in 64 KiB chunks, its OBX lines written as they are sent. */
async function* messageChunks(bytes, onSegment) {
  let pending = "MSH|^~\\&|LAB|SENDFAC|EHR|RECVFAC|20260101120000||ORU^R01|R1|P|2.5\r";
  pending += "PID|1||FAKE000001^^^HOSP^MR||Roe^Sam^T||19750615|M\r";
  pending += "OBR|1||ACC000001|CBC^Complete Blood Count^LN|||20260101120000\r";
  for (let k = 0, sent = 0; sent < bytes; k++) {
    const line =
      k % 5000 === 4999
        ? // A base64 document of 256 KiB in one field, every 5000th result.
          `OBX|${String(k + 1)}|ED|DOC^Document^LN||^AP^PDF^Base64^${"QUJD".repeat(64 * 1024)}||||||F\r`
        : `OBX|${String(k + 1)}|NM|GLU^Glucose^LN||${String(80 + (k % 40))}|mg/dL|70-110|N|||F\r`;
    onSegment(line.length);
    sent += line.length;
    pending += line;
    while (pending.length >= CHUNK) {
      yield Buffer.from(pending.slice(0, CHUNK), "latin1");
      pending = pending.slice(CHUNK);
    }
  }
  if (pending.length > 0) yield Buffer.from(pending, "latin1");
}

/**
 * Read every item twice: once timed, with no collection forced, and once sampling memory every
 * `every` items. `read` makes a fresh reader over a fresh source each time. A first, short read
 * warms the reader up, so the code it compiles is not counted as memory it holds.
 */
async function measure(read, every, onItem) {
  for await (const item of read(Math.min(total, MIB / 4))) onItem(item);
  const start = performance.now();
  let count = 0;
  for await (const item of read(total)) {
    onItem(item);
    count += 1;
  }
  const ms = performance.now() - start;
  const before = held();
  let peak = 0;
  let sampled = 0;
  for await (const item of read(total)) {
    onItem(item);
    sampled += 1;
    if (sampled % every === 0) peak = Math.max(peak, held() - before);
  }
  peak = Math.max(peak, held() - before);
  return { count, ms, peak };
}

const readings = [];

{
  let largest = 0;
  let source = 0;
  let failed = 0;
  const result = await measure(
    (bytes) => {
      largest = 0;
      source = 0;
      failed = 0;
      return hl7.readMessages(
        batchChunks(bytes, (n) => {
          largest = Math.max(largest, n);
          source += n;
        }),
      );
    },
    200,
    (item) => {
      if (!item.ok) failed += 1;
      // Read the header and the patient, as a consumer would.
      else item.message.get("PID.3.1");
    },
  );
  readings.push({
    reader: "readMessages",
    source: `a batch of ${String(result.count)} messages`,
    sourceBytes: source,
    largestItemBytes: largest,
    failed,
    ...result,
  });
}

{
  let largest = 0;
  let source = 0;
  const result = await measure(
    (bytes) => {
      largest = 0;
      source = 0;
      return hl7.readSegments(
        messageChunks(bytes, (n) => {
          largest = Math.max(largest, n);
          source += n;
        }),
      );
    },
    2000,
    (item) => item.segment.type,
  );
  readings.push({
    reader: "readSegments",
    source: `one message of ${String(result.count)} segments`,
    sourceBytes: source,
    largestItemBytes: largest,
    failed: 0,
    ...result,
  });
}

const mib = (n) => (n / MIB).toFixed(2);
const rows = readings.map((r) => ({
  ...r,
  peakToLargest: r.peak / r.largestItemBytes,
  mibPerSecond: r.sourceBytes / MIB / (r.ms / 1000),
}));
const markdown = [
  `Node ${process.version}, ${values.mib} MiB source, read in 64 KiB chunks.`,
  "",
  "| Reader | Source | Source MiB | Largest item MiB | Peak held MiB | Peak / largest | MiB/s |",
  "| --- | --- | ---: | ---: | ---: | ---: | ---: |",
  ...rows.map(
    (r) =>
      `| ${r.reader} | ${r.source} | ${mib(r.sourceBytes)} | ${mib(r.largestItemBytes)} | ` +
      `${mib(r.peak)} | ${r.peakToLargest.toFixed(2)} | ${r.mibPerSecond.toFixed(1)} |`,
  ),
].join("\n");

console.log(markdown);
if (values.out !== undefined) writeFileSync(values.out, `${JSON.stringify(rows, null, 2)}\n`);
if (values.summary !== undefined) writeFileSync(values.summary, `${markdown}\n`);
