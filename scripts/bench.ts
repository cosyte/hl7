/**
 * `@cosyte/hl7` benchmark suite (roadmap Phase W — performance / throughput bar).
 *
 * A **reproducible** benchmark that measures the reference parser's:
 *
 *   - **parse throughput** — messages/sec and MB/sec across representative
 *     message classes (a small ADT^A01, a larger multi-OBX ORU^R01);
 *   - **per-message retained memory** — the steady-state heap cost of holding a
 *     parsed `Hl7Message` (materialize N, divide the retained delta by N);
 *   - **streaming peak memory** — the headline HL7-S claim: `parseStream` over a
 *     large batch retains **O(one message)**, not O(file). We report the heap the
 *     streamer holds at its peak against the heap a whole-buffer parse of the same
 *     bytes retains, so the ratio (streaming ≪ whole) is visible, not asserted.
 *
 * Inputs are **synthetic-only** (generated here — no PHI, no fixture) so the run
 * is self-contained and reproducible on any machine. Absolute numbers are
 * **machine- and load-dependent** — they are published as *indicative* context,
 * never as a portable floor. The portable, CI-gating guard lives in
 * `test/perf/perf-regression.test.ts` and is **ratio-based** for exactly that
 * reason (see `docs-content/benchmarks.md`). This phase adds **no runtime
 * behavior**: it only measures the shipped surface.
 *
 * Run:
 *
 *     pnpm bench            # human-readable table to stdout
 *     pnpm bench --markdown # the results-table body used in docs-content/benchmarks.md
 *
 * `--gc` (with `node --expose-gc`) tightens the memory numbers by forcing a
 * collection before each sample; without it the numbers are still directionally
 * correct (the streaming ≪ whole gap is orders of magnitude).
 */

import { performance } from "node:perf_hooks";

import { parseHL7, parseStream, splitBatch } from "../src/index.js";
import type { Hl7Message } from "../src/index.js";

const MARKDOWN = process.argv.includes("--markdown");
const maybeGc = (globalThis as { gc?: () => void }).gc;

/**
 * A small, spec-clean ADT^A01 (5 segments) — the highest-traffic admit message,
 * the low end of the size range. Synthetic: every name/id is fabricated.
 */
function adtMessage(i: number): string {
  const id = String(i).padStart(6, "0");
  return (
    `MSH|^~\\&|SENDAPP|SENDFAC|RECVAPP|RECVFAC|20260101120000||ADT^A01|A${id}|P|2.5\r` +
    `EVN|A01|20260101120000\r` +
    `PID|1||FAKE${id}^^^HOSP^MR||Doe^Jane^Q||19800101|F|||123 Main St^^Anytown^CA^90001\r` +
    `NK1|1|Doe^John^R|SPO|123 Main St^^Anytown^CA^90001\r` +
    `PV1|1|I|WARD^101^A|||||DOC123^Smith^Robert\r`
  );
}

/**
 * A larger ORU^R01 (12 segments — OBR + 8 OBX result lines) — the result-report
 * shape that dominates lab/ELR volume, the high end of the size range.
 */
function oruMessage(i: number): string {
  const id = String(i).padStart(6, "0");
  const obx = Array.from(
    { length: 8 },
    (_v, k) =>
      `OBX|${String(k + 1)}|NM|GLU^Glucose^LN||${String(80 + k)}|mg/dL|70-110|N|||F|||20260101120000`,
  ).join("\r");
  return (
    `MSH|^~\\&|LAB|SENDFAC|EHR|RECVFAC|20260101120000||ORU^R01|R${id}|P|2.5\r` +
    `PID|1||FAKE${id}^^^HOSP^MR||Roe^Sam^T||19750615|M\r` +
    `OBR|1||ACC${id}|CBC^Complete Blood Count^LN|||20260101120000\r` +
    `${obx}\r`
  );
}

/** Median of a numeric sample (sorted middle). */
function median(xs: readonly number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? ((s[mid - 1] ?? 0) + (s[mid] ?? 0)) / 2 : (s[mid] ?? 0);
}

/** Retained heap in bytes, with an optional forced GC for a cleaner reading. */
function heapUsed(): number {
  maybeGc?.();
  return process.memoryUsage().heapUsed;
}

/**
 * Time parsing `msgs` end to end, `reps` times after a warm-up, returning the
 * median elapsed milliseconds. The result array is consumed (length summed) so a
 * JIT can't dead-code-eliminate the parse.
 */
function timeParse(msgs: readonly string[], reps: number): number {
  // Warm-up (JIT) — not measured.
  let sink = 0;
  for (const m of msgs) sink += parseHL7(m).segments.length;
  const samples: number[] = [];
  for (let r = 0; r < reps; r++) {
    const t0 = performance.now();
    for (const m of msgs) sink += parseHL7(m).segments.length;
    samples.push(performance.now() - t0);
  }
  if (sink < 0) throw new Error("unreachable");
  return median(samples);
}

interface ThroughputRow {
  readonly label: string;
  readonly count: number;
  readonly bytes: number;
  readonly msPerRun: number;
  readonly msgsPerSec: number;
  readonly mbPerSec: number;
  readonly heapPerMsgBytes: number;
}

function throughput(label: string, builder: (i: number) => string, n: number): ThroughputRow {
  const msgs = Array.from({ length: n }, (_v, i) => builder(i));
  const bytes = msgs.reduce((sum, m) => sum + Buffer.byteLength(m, "utf8"), 0);
  const msPerRun = timeParse(msgs, 5);
  const msgsPerSec = (n / msPerRun) * 1000;
  const mbPerSec = bytes / 1e6 / (msPerRun / 1000);

  // Per-message retained heap: materialize all N and measure the delta.
  const base = heapUsed();
  const held: Hl7Message[] = msgs.map((m) => parseHL7(m));
  const after = heapUsed();
  const heapPerMsgBytes = Math.max(0, after - base) / held.length;
  if (held.length !== n) throw new Error("unreachable");

  return { label, count: n, bytes, msPerRun, msgsPerSec, mbPerSec, heapPerMsgBytes };
}

interface StreamingRow {
  readonly count: number;
  readonly bytes: number;
  readonly wholeRetainedBytes: number;
  readonly streamPeakBytes: number;
  readonly ratio: number;
}

/**
 * The streaming-peak headline. Build one large batch string, then compare:
 *   - **whole-buffer** — `splitBatch` materializes every message → O(N) retained;
 *   - **streaming** — `parseStream` drains the same bytes keeping only a running
 *     count → O(1) retained; we sample heap at each yield and keep the peak delta.
 */
async function streaming(n: number): Promise<StreamingRow> {
  const parts: string[] = [];
  for (let i = 0; i < n; i++) parts.push(adtMessage(i));
  const batch = parts.join("");
  const bytes = Buffer.byteLength(batch, "utf8");

  // Whole-buffer retained (hold every parsed message).
  const wholeBase = heapUsed();
  const whole = splitBatch(batch);
  const wholeAfter = heapUsed();
  const wholeRetainedBytes = Math.max(0, wholeAfter - wholeBase);
  if (whole.messages.length !== n) throw new Error(`splitBatch count ${whole.messages.length}`);

  // Streaming: feed the batch in fixed-size chunks; sample heap at each yield.
  const CHUNK = 4096;
  async function* chunks(): AsyncGenerator<string> {
    for (let i = 0; i < batch.length; i += CHUNK) {
      await Promise.resolve();
      yield batch.slice(i, i + CHUNK);
    }
  }
  const streamBase = heapUsed();
  let received = 0;
  let peakDelta = 0;
  for await (const entry of parseStream(chunks())) {
    if (entry.ok) received += 1;
    // Sample without forcing GC (peak is transient); track the max growth.
    const delta = process.memoryUsage().heapUsed - streamBase;
    if (delta > peakDelta) peakDelta = delta;
  }
  if (received !== n) throw new Error(`stream count ${String(received)}`);
  const streamPeakBytes = Math.max(1, peakDelta);
  return {
    count: n,
    bytes,
    wholeRetainedBytes,
    streamPeakBytes,
    ratio: streamPeakBytes / Math.max(1, wholeRetainedBytes),
  };
}

function fmtBytes(b: number): string {
  if (b >= 1e6) return `${(b / 1e6).toFixed(1)} MB`;
  if (b >= 1e3) return `${(b / 1e3).toFixed(1)} KB`;
  return `${b.toFixed(0)} B`;
}

async function main(): Promise<void> {
  const rows = [
    throughput("ADT^A01 (5 seg)", adtMessage, 20_000),
    throughput("ORU^R01 (12 seg)", oruMessage, 10_000),
  ];
  const stream = await streaming(20_000);

  const meta = {
    node: process.version,
    platform: `${process.platform}/${process.arch}`,
    gc: maybeGc ? "forced (--expose-gc)" : "not forced",
    date: new Date().toISOString().slice(0, 10),
  };

  if (MARKDOWN) {
    const lines: string[] = [];
    lines.push(
      `> Indicative run: Node ${meta.node}, ${meta.platform}, GC ${meta.gc}, ${meta.date}. ` +
        `Absolute numbers are machine- and load-dependent — see Methodology.`,
    );
    lines.push("");
    lines.push("| Message class | N | msgs/sec | MB/sec | retained heap / msg |");
    lines.push("| --- | --- | --- | --- | --- |");
    for (const r of rows) {
      lines.push(
        `| ${r.label} | ${r.count.toLocaleString()} | ${Math.round(r.msgsPerSec).toLocaleString()} | ` +
          `${r.mbPerSec.toFixed(1)} | ${fmtBytes(r.heapPerMsgBytes)} |`,
      );
    }
    lines.push("");
    lines.push("| Streaming (parseStream) | N | whole-buffer retained | streaming peak | ratio |");
    lines.push("| --- | --- | --- | --- | --- |");
    lines.push(
      `| ADT^A01 batch | ${stream.count.toLocaleString()} | ${fmtBytes(stream.wholeRetainedBytes)} | ` +
        `${fmtBytes(stream.streamPeakBytes)} | ${stream.ratio.toFixed(3)}× |`,
    );
    process.stdout.write(`${lines.join("\n")}\n`);
    return;
  }

  process.stdout.write(
    `\n@cosyte/hl7 benchmark — Node ${meta.node}, ${meta.platform}, GC ${meta.gc}\n\n`,
  );
  for (const r of rows) {
    process.stdout.write(
      `  ${r.label.padEnd(18)} ${Math.round(r.msgsPerSec).toLocaleString().padStart(10)} msg/s   ` +
        `${r.mbPerSec.toFixed(1).padStart(6)} MB/s   ` +
        `${fmtBytes(r.heapPerMsgBytes).padStart(9)}/msg\n`,
    );
  }
  process.stdout.write(
    `\n  streaming ${stream.count.toLocaleString()} msgs: whole-buffer retains ` +
      `${fmtBytes(stream.wholeRetainedBytes)}, parseStream peak ${fmtBytes(stream.streamPeakBytes)} ` +
      `(${stream.ratio.toFixed(3)}× — O(one message), not O(file))\n\n`,
  );
}

await main();
