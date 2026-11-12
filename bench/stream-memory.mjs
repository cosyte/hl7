// How much memory the streaming readers hold, against the largest item they read, and a gate on
// it: `readMessages` and `parseStream` over a batch should hold about one message however large the
// batch is, and `readSegments` over one large message about one segment (see GATED_READERS).
//
//   pnpm build && node bench/stream-memory.mjs --target dist/index.mjs --mib 100 \
//     --out stream-memory.json --summary stream-memory.md
//
// It takes RUNS readings of each reader, each in a new process (this file again, with `--reader`),
// and judges each reader on the median of its readings. It exits 1 when a gated reader's median
// peak is more than its limit in PEAK_LIMITS, a multiple of the largest item it read, and 2 when a
// reader cannot be judged (missing, short of readings, with no limit, or a reading that read
// nothing, failed an item or did not finish in `--timeout` seconds, READING_TIMEOUT_SECONDS by
// default). The 100 MiB reading runs on a
// GitHub-hosted runner, in the stream-memory workflow, never on a shared developer machine;
// `--mib 1` is a quick local check. Every message is synthetic and built here from an index, as the
// source produces it: the source is a generator of 64 KiB chunks, so the batch is never held whole
// by anything but the reader under test.
//
// Each reading reads its source three times: a short read to warm the reader up, a timed read with
// no collection forced, then a read that takes two full collections every few items and reads the
// heap and the array buffers after each. `peak` is the most they held above the reading taken
// before that read, after the second collection (see `measure` for why the second).

import { spawnSync } from "node:child_process";
import { performance } from "node:perf_hooks";
import { parseArgs } from "node:util";
import { writeFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { setFlagsFromString } from "node:v8";
import { runInNewContext } from "node:vm";
import { resolve } from "node:path";

import { adtMessage, documentMessage, oruMessage } from "./parse.bench.mjs";

const MIB = 1024 * 1024;
const CHUNK = 64 * 1024;
/** This file, run again with `--reader` for each reading. */
const SCRIPT = fileURLToPath(import.meta.url);

/**
 * How many readings of each reader the gate takes, each in a process of its own, and judges on
 * their median. One reading in nineteen of unchanged code read a message more than the rest, over
 * the limit; with five, a stray reading must come three times in one job to fail it.
 */
export const RUNS = 5;

/**
 * How long one reading may take, in seconds, before its process is killed. A reading at 100 MiB
 * takes seconds on a GitHub-hosted runner; a reading that hangs ends here as one that cannot be
 * judged, rather than holding the job until the job's own timeout and reporting nothing.
 */
export const READING_TIMEOUT_SECONDS = 120;

/**
 * The most each streaming reader may hold at its peak, as a multiple of the largest item it read,
 * judged on the median of its readings. Each is set from forty readings of the reader on a
 * GitHub-hosted runner, recorded in stream-memory-readings.json beside this file: midway between
 * the highest of them and the lowest one plus one, the reading a reader would give holding one
 * largest item more, rounded to a twentieth. So the reader as it is keeps at least a third of an
 * item of room under its limit, and a reader holding one item more lands at least a third of an
 * item over it. A reader that buffered its source would hold toward all of it, far past these on a
 * 100 MiB source. The absolute budgets of the parse benchmarks live in @cosyte/bench's budgets
 * file; these ratios are not a measure that file holds, so they are written here.
 *
 * - `readMessages`: forty readings of 1.75 to 1.99, so 2.35.
 * - `parseStream`: forty readings of 0.82 to 1.09, so 1.45.
 * - `readSegments`: forty readings of 1.11 to 1.12, so 1.6.
 */
export const PEAK_LIMITS = Object.freeze({
  readMessages: 2.35,
  parseStream: 1.45,
  readSegments: 1.6,
});

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

/** A byte count a reading can be judged on: a finite number, zero or more. */
function measured(bytes) {
  return typeof bytes === "number" && Number.isFinite(bytes) && bytes >= 0;
}

/**
 * The middle of `values`, sorted: the middle one of an odd count, the higher of the two middle ones
 * of an even count, so a tie between a low half and a high half is judged on the high half.
 */
export function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

/** Why a reading of a gated reader cannot be judged, or undefined when it can be. */
function unjudgeable(r) {
  if (r.timedOut === true) {
    return `${r.reader}: a reading did not finish in ${String(r.timeoutSeconds)} seconds, so there is nothing to judge`;
  }
  // A missing size gives a ratio of NaN, and NaN is over no limit: it must not read as within.
  if (!measured(r.peak) || !measured(r.largestItemBytes)) {
    return `${r.reader}: no peak or no largest item size, so there is nothing to judge`;
  }
  if (r.count === 0 || r.largestItemBytes === 0) {
    return `${r.reader}: read nothing, so there is nothing to judge`;
  }
  if (r.failed > 0) {
    return `${r.reader}: ${String(r.failed)} item(s) failed, so the reading misses them`;
  }
  return undefined;
}

/** The limit `limits` sets for `reader`: the number itself, or the reader's own entry. */
function limitOf(limits, reader) {
  return typeof limits === "number" ? limits : limits[reader];
}

/**
 * Judge readings against the limits. `rows` holds every reading, `runs` of them for each reader
 * (one, by default), each taken in a process of its own. A reader is judged on the median of its
 * readings' ratios, so one stray reading cannot fail unchanged code and one low reading cannot pass
 * a regression: with five readings, three must be over the limit to fail and three within it to
 * pass.
 *
 * `limits` is a multiple of the largest item for every reader, or an object holding one for each.
 * Exit code 0 when every gated reader's median is at or under its limit times its largest item, 1
 * when one is over, and 2 when a reader cannot be judged: a gated reader missing from `rows`, with
 * no limit in `limits`, or with fewer than `runs` readings, or any one of its readings that read
 * nothing or no bytes, whose peak or
 * largest item size is absent, not a finite number or negative, that failed an item, whose
 * reading then misses that item's memory, or that did not finish in its time (`timedOut`). A
 * reading that cannot be judged is not outvoted by the others, and it outranks a finding. A reader
 * not in `gated` is listed with its ratio and never changes the exit code.
 */
export function judge(rows, limits = PEAK_LIMITS, gated = GATED_READERS, runs = 1) {
  const lines = [];
  let over = false;
  let unjudged = false;
  const readers = [...new Set(rows.map((r) => r.reader))];
  for (const reader of readers) {
    const own = rows.filter((r) => r.reader === reader);
    const ratios = own.map((r) =>
      r.largestItemBytes > 0 ? r.peak / r.largestItemBytes : Number.NaN,
    );
    const middle = median(ratios);
    const low = Math.min(...ratios);
    const high = Math.max(...ratios);
    const peak =
      own.length === 1
        ? `peak ${middle.toFixed(2)} times the largest item`
        : `median peak ${middle.toFixed(2)} times the largest item over ${String(own.length)} ` +
          `readings (${low.toFixed(2)} to ${high.toFixed(2)})`;
    if (!gated.includes(reader)) {
      lines.push(`${reader}: ${peak}, measured, not gated`);
      continue;
    }
    const reasons = own.map(unjudgeable).filter((reason) => reason !== undefined);
    const limit = limitOf(limits, reader);
    if (reasons.length > 0) {
      unjudged = true;
      lines.push(...new Set(reasons));
    } else if (own.length < runs) {
      unjudged = true;
      lines.push(
        `${reader}: ${String(own.length)} of ${String(runs)} readings, so there is nothing to judge`,
      );
    } else if (typeof limit !== "number" || !Number.isFinite(limit) || limit <= 0) {
      // A reader with no limit is over no limit: it must not read as within.
      unjudged = true;
      lines.push(`${reader}: no limit, so there is nothing to judge`);
    } else {
      const verdict = middle > limit ? "over" : "within";
      if (middle > limit) over = true;
      lines.push(`${reader}: ${peak}, ${verdict} the limit of ${String(limit)}`);
    }
  }
  // A gated reader with no row at all: a reading that skipped it must not pass on the others.
  for (const reader of gated) {
    if (readers.includes(reader)) continue;
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
 *
 * Each sample is read after one full collection and again after a second, and the gate judges the
 * second. A collection finds array buffers dead but frees them in a sweep that can finish after it
 * returns, so a reading taken straight after one collection can still count megabytes of buffers
 * nothing holds; the second collection finishes the first one's sweep before it starts. `peak` is
 * the most held above the reading taken before that read, after the second collection;
 * `peakAfterOneCollection` the same read after the first, and `unsweptArrayBuffers` the most the
 * two readings of one sample's array buffers differed by.
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
  let peakAfterOneCollection = 0;
  let unsweptArrayBuffers = 0;
  const sample = () => {
    const now = held();
    peak = Math.max(peak, now.twice.total - before.twice.total);
    peakAfterOneCollection = Math.max(peakAfterOneCollection, now.once.total - before.once.total);
    unsweptArrayBuffers = Math.max(
      unsweptArrayBuffers,
      now.once.arrayBuffers - now.twice.arrayBuffers,
    );
  };
  let sampled = 0;
  for await (const item of read(total)) {
    onItem(item);
    sampled += 1;
    if (sampled % every === 0) sample();
  }
  sample();
  return { count, ms, peak, peakAfterOneCollection, unsweptArrayBuffers };
}

/** Measure `reader` once from the build at `hl7`, on a source of `total` bytes. */
async function measureReader(hl7, reader, total, held) {
  if (reader === "readSegments") {
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
    return {
      reader,
      source: `one message of ${String(result.count)} segments`,
      sourceBytes: source,
      largestItemBytes: largest,
      failed: 0,
      ...result,
    };
  }
  // The two message readers over the same batch: `readMessages`, and the older `parseStream`.
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
  return {
    reader,
    source: `a batch of ${String(result.count)} messages`,
    sourceBytes: source,
    largestItemBytes: largest,
    failed,
    ...result,
  };
}

/** One reading of `reader`, in this process: the row is written to stdout as one line of JSON. */
async function child(target, reader, total) {
  setFlagsFromString("--expose-gc");
  const gc = runInNewContext("gc");
  const usage = () => {
    const { heapUsed, arrayBuffers } = process.memoryUsage();
    return { heap: heapUsed, arrayBuffers, total: heapUsed + arrayBuffers };
  };
  /**
   * Heap and array buffers held now, after one full collection and again after a second, as
   * test/perf/stream-memory.perf.ts reads them.
   */
  const held = () => {
    gc();
    const once = usage();
    gc();
    return { once, twice: usage() };
  };
  const hl7 = await import(pathToFileURL(resolve(target)).href);
  const row = await measureReader(hl7, reader, total, held);
  process.stdout.write(`${JSON.stringify({ ...row, pid: process.pid })}\n`);
}

/**
 * Take `runs` readings of every gated reader, each in a new process, so no reading inherits the
 * heap, the compiled code or the garbage of another. The rounds run one after another, each reading
 * the three readers in turn, so a change in the runner's load lands on all three.
 */
function readings(target, mib, runs, timeoutSeconds) {
  const rows = [];
  for (let run = 1; run <= runs; run++) {
    for (const reader of GATED_READERS) {
      const result = spawnSync(
        process.execPath,
        [SCRIPT, "--reader", reader, "--target", target, "--mib", mib],
        {
          encoding: "utf8",
          maxBuffer: 16 * MIB,
          stdio: ["ignore", "pipe", "inherit"],
          timeout: timeoutSeconds * 1000,
          killSignal: "SIGKILL",
        },
      );
      const timedOut = result.error?.code === "ETIMEDOUT";
      let row;
      try {
        row = JSON.parse((result.stdout ?? "").trim().split("\n").at(-1) ?? "");
      } catch {
        row = undefined;
      }
      // A reading that did not finish is still a row, with no peak, so the reader cannot be judged.
      rows.push(
        result.status === 0 && row !== undefined && !timedOut
          ? { ...row, run }
          : timedOut
            ? { reader, run, count: 0, failed: 0, timedOut, timeoutSeconds }
            : { reader, run, count: 0, failed: 0, exitStatus: result.status },
      );
    }
  }
  return rows;
}

/** Measure every reader `runs` times on a source of `mib` MiB from the build at `target`, and judge them. */
async function main() {
  const { values } = parseArgs({
    options: {
      target: { type: "string", default: "dist/index.mjs" },
      mib: { type: "string", default: "1" },
      runs: { type: "string", default: String(RUNS) },
      timeout: { type: "string", default: String(READING_TIMEOUT_SECONDS) },
      reader: { type: "string" },
      out: { type: "string" },
      summary: { type: "string" },
    },
  });
  const total = Number(values.mib) * MIB;
  if (values.reader !== undefined) {
    await child(values.target, values.reader, total);
    return;
  }

  const runs = Number(values.runs);
  const mib = (n) => (n === undefined ? "-" : (n / MIB).toFixed(2));
  const rows = readings(values.target, values.mib, runs, Number(values.timeout)).map((r) => ({
    ...r,
    peakToLargest: r.peak / r.largestItemBytes,
    mibPerSecond: r.sourceBytes / MIB / (r.ms / 1000),
  }));
  const verdict = judge(rows, PEAK_LIMITS, GATED_READERS, runs);
  const ratio = (n) => (Number.isFinite(n) ? n.toFixed(2) : "-");
  const markdown = [
    `Node ${process.version}, ${values.mib} MiB source, read in 64 KiB chunks, ` +
      `${String(runs)} readings of each reader, each in a process of its own. The limits: a median ` +
      "peak of at most " +
      GATED_READERS.map(
        (reader) => `${String(PEAK_LIMITS[reader])} times the largest item for ${reader}`,
      ).join(", ") +
      ".",
    "",
    "| Reader | Reading | Source | Source MiB | Largest item MiB | Peak held MiB | Peak / largest | " +
      "Peak / largest, after one collection | Unswept array buffers MiB | MiB/s |",
    "| --- | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
    ...GATED_READERS.flatMap((reader) =>
      rows
        .filter((r) => r.reader === reader)
        .map(
          (r) =>
            `| ${r.reader} | ${String(r.run)} | ${r.source ?? "did not finish"} | ` +
            `${mib(r.sourceBytes)} | ${mib(r.largestItemBytes)} | ${mib(r.peak)} | ` +
            `${ratio(r.peakToLargest)} | ${ratio(r.peakAfterOneCollection / r.largestItemBytes)} | ` +
            `${mib(r.unsweptArrayBuffers)} | ${ratio(r.mibPerSecond)} |`,
        ),
    ),
    "",
    ...verdict.lines.map((line) => `- ${line}`),
  ].join("\n");

  console.log(markdown);
  if (values.out !== undefined) {
    const document = {
      peakLimits: PEAK_LIMITS,
      runs,
      exitCode: verdict.exitCode,
      verdict: verdict.lines,
      readers: rows,
    };
    writeFileSync(values.out, `${JSON.stringify(document, null, 2)}\n`);
  }
  if (values.summary !== undefined) writeFileSync(values.summary, `${markdown}\n`);
  process.exitCode = verdict.exitCode;
}

// Run only as a program: a test imports this file for `judge` and `PEAK_LIMITS`.
if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  await main();
}
