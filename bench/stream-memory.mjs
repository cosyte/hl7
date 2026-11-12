// How much memory the streaming readers hold, against the largest item they read, and a gate on
// it: `readMessages` and `parseStream` over a batch should hold about one message however large the
// batch is, and `readSegments` over one large message about one segment (see GATED_READERS).
//
//   pnpm build && node bench/stream-memory.mjs --target dist/index.mjs --mib 100 \
//     --out stream-memory.json --summary stream-memory.md
//
// It exits 1 when a gated reader's peak is more than PEAK_MULTIPLE times the largest item it read,
// and 2 when a reading cannot be judged (a gated reader is missing, read nothing, or failed an
// item). The 100 MiB reading runs on a GitHub-hosted runner, in the stream-memory workflow, never
// on a shared developer machine; `--mib 1` is a quick local check. Every message is synthetic and built here from an
// index, as the source produces it: the source is a generator of 64 KiB chunks, so the batch is
// never held whole by anything but the reader under test.
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

/**
 * The most a streaming reader may hold at its peak, as a multiple of the largest item it read: the
 * item itself, the text it was read from, and room for the reader's own state. A reader that
 * buffered its source would hold toward all of it, far past this on a 100 MiB source. The absolute
 * budgets of the parse benchmarks live in @cosyte/bench's budgets file; this ratio is not a measure
 * that file holds, so it is written here.
 */
export const PEAK_MULTIPLE = 3;

/**
 * The readers the gate judges: all three. `readMessages` and `parseStream` read the 100 MiB batch,
 * whose largest message is 4 MiB; `readSegments` reads one 100 MiB message whose largest segment is
 * 4 MiB, a base64 document in one field.
 *
 * `parseStream` was measured, not judged, while it held 2.99 to 3.98 times its largest message
 * (seven stream-memory runs on GitHub-hosted runners: 43063981717, 43064467751, 43066398448,
 * 43067421821, 43069553162, 43071783838 and 43073735956): it cut every segment from one growing
 * buffer, kept alive while it yielded the message, and the message decoded a second copy of the
 * text the entry's `raw` already held. `readSegments` was measured, not judged, on a source whose
 * largest segment was 256 KiB: beside it, a few 64 KiB chunks and the text they decode to moved
 * its ratio from 1.82 to 3.41. Its largest segment is now 4 MiB, the item read when memory is
 * sampled, so the reader's own state is small beside it.
 */
export const GATED_READERS = Object.freeze(["readMessages", "parseStream", "readSegments"]);

/**
 * Judge readings against the limit. Exit code 0 when every gated reader is at or under `multiple`
 * times its largest item, 1 when one is over, and 2 when a reading cannot be judged: a gated reader
 * missing from `rows`, one that read nothing or no bytes, or one that failed an item, whose reading
 * then misses that item's memory. A reading that cannot be judged outranks a finding. A reader not
 * in `gated` is listed with its ratio and never changes the exit code.
 */
export function judge(rows, multiple = PEAK_MULTIPLE, gated = GATED_READERS) {
  const lines = [];
  let over = false;
  let unjudged = false;
  for (const r of rows) {
    const ratio = r.largestItemBytes > 0 ? r.peak / r.largestItemBytes : Number.NaN;
    if (!gated.includes(r.reader)) {
      lines.push(
        `${r.reader}: peak ${ratio.toFixed(2)} times the largest item, measured, not gated`,
      );
    } else if (r.count === 0 || r.largestItemBytes === 0) {
      unjudged = true;
      lines.push(`${r.reader}: read nothing, so there is nothing to judge`);
    } else if (r.failed > 0) {
      unjudged = true;
      lines.push(`${r.reader}: ${String(r.failed)} item(s) failed, so the reading misses them`);
    } else {
      const verdict = ratio > multiple ? "over" : "within";
      if (ratio > multiple) over = true;
      lines.push(
        `${r.reader}: peak ${ratio.toFixed(2)} times the largest item, ${verdict} the limit of ${String(multiple)}`,
      );
    }
  }
  // A gated reader with no row at all: a reading that skipped it must not pass on the others.
  for (const reader of gated) {
    if (rows.some((r) => r.reader === reader)) continue;
    unjudged = true;
    lines.push(`${reader}: not measured, so there is nothing to judge`);
  }
  return { exitCode: unjudged ? 2 : over ? 1 : 0, lines };
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

/** Every SEGMENTS_PER_DOCUMENTth item `readSegments` reads is a 4 MiB document segment. */
const SEGMENTS_PER_DOCUMENT = 20000;
/** 64 KiB of base64 text, sent sixty-four times for a 4 MiB document field. */
const DOCUMENT_PIECE = "QUJD".repeat(CHUNK / 4);

/**
 * One ORU^R01 of about `bytes` bytes, in 64 KiB chunks, its OBX lines written as they are sent.
 * Every SEGMENTS_PER_DOCUMENTth segment is a result carrying a 4 MiB base64 document in one field,
 * the largest segment by far, and it is the item read when memory is sampled (every 2000th). The
 * document is sent a piece at a time, so the source never holds it whole.
 */
async function* messageChunks(bytes, onSegment) {
  let pending = "MSH|^~\\&|LAB|SENDFAC|EHR|RECVFAC|20260101120000||ORU^R01|R1|P|2.5\r";
  pending += "PID|1||FAKE000001^^^HOSP^MR||Roe^Sam^T||19750615|M\r";
  pending += "OBR|1||ACC000001|CBC^Complete Blood Count^LN|||20260101120000\r";
  // The three segments above are items 1 to 3; result k is item k + 4.
  for (let k = 0, sent = 0; sent < bytes; k++) {
    const document = (k + 4) % SEGMENTS_PER_DOCUMENT === 0;
    const parts = document
      ? [
          `OBX|${String(k + 1)}|ED|DOC^Document^LN||^AP^PDF^Base64^`,
          ...Array.from({ length: (4 * MIB) / CHUNK }, () => DOCUMENT_PIECE),
          "||||||F\r",
        ]
      : [`OBX|${String(k + 1)}|NM|GLU^Glucose^LN||${String(80 + (k % 40))}|mg/dL|70-110|N|||F\r`];
    const length = parts.reduce((n, part) => n + part.length, 0);
    onSegment(length);
    sent += length;
    for (const part of parts) {
      pending += part;
      while (pending.length >= CHUNK) {
        yield Buffer.from(pending.slice(0, CHUNK), "latin1");
        pending = pending.slice(CHUNK);
      }
    }
  }
  if (pending.length > 0) yield Buffer.from(pending, "latin1");
}

/**
 * Read every item twice: once timed, with no collection forced, and once sampling memory every
 * `every` items. `read` makes a fresh reader over a fresh source of `total` bytes each time, and
 * `held` reads the memory held after a full collection. A first, short read warms the reader up, so
 * the code it compiles is not counted as memory it holds.
 */
async function measure(read, every, onItem, total, held) {
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

/** Measure every reader on a source of `mib` MiB from the build at `target`, and judge them. */
async function main() {
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
  /** Heap and array buffers held now, after a full collection. */
  const held = () => {
    gc();
    const usage = process.memoryUsage();
    return usage.heapUsed + usage.arrayBuffers;
  };

  const hl7 = await import(pathToFileURL(resolve(values.target)).href);
  const total = Number(values.mib) * MIB;
  const readings = [];

  // The two message readers over the same batch: `readMessages`, and the older `parseStream`.
  for (const reader of ["readMessages", "parseStream"]) {
    let largest = 0;
    let source = 0;
    let failed = 0;
    const result = await measure(
      (bytes) => {
        largest = 0;
        source = 0;
        failed = 0;
        return hl7[reader](
          batchChunks(bytes, (n) => {
            largest = Math.max(largest, n);
            source += n;
          }),
        );
      },
      200,
      (item) => {
        if (!item.ok) failed += 1;
        // Read the patient, as a consumer would.
        else item.message.get("PID.3.1");
      },
      total,
      held,
    );
    readings.push({
      reader,
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
      total,
      held,
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
  const verdict = judge(rows);
  const markdown = [
    `Node ${process.version}, ${values.mib} MiB source, read in 64 KiB chunks. ` +
      `The limit: a peak of at most ${String(PEAK_MULTIPLE)} times the largest item.`,
    "",
    "| Reader | Source | Source MiB | Largest item MiB | Peak held MiB | Peak / largest | MiB/s |",
    "| --- | --- | ---: | ---: | ---: | ---: | ---: |",
    ...rows.map(
      (r) =>
        `| ${r.reader} | ${r.source} | ${mib(r.sourceBytes)} | ${mib(r.largestItemBytes)} | ` +
        `${mib(r.peak)} | ${r.peakToLargest.toFixed(2)} | ${r.mibPerSecond.toFixed(1)} |`,
    ),
    "",
    ...verdict.lines.map((line) => `- ${line}`),
  ].join("\n");

  console.log(markdown);
  if (values.out !== undefined) {
    const document = { peakMultiple: PEAK_MULTIPLE, exitCode: verdict.exitCode, readers: rows };
    writeFileSync(values.out, `${JSON.stringify(document, null, 2)}\n`);
  }
  if (values.summary !== undefined) writeFileSync(values.summary, `${markdown}\n`);
  process.exitCode = verdict.exitCode;
}

// Run only as a program: a test imports this file for `judge` and `PEAK_MULTIPLE`.
if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  await main();
}
