/**
 * Performance-regression guard (roadmap Phase W: performance / throughput bar).
 *
 * This is the **CI-gating** half of Phase W (the human-readable benchmark suite
 * with published numbers is `scripts/bench.ts` → `docs-content/benchmarks.md`).
 * Its job is narrow: fail if a future change **silently degrades** parse
 * performance or breaks the HL7-S streaming memory guarantee: without
 * false-alarming across CI runners of wildly different speed and under v8
 * coverage instrumentation.
 *
 * ## Why every guard here is RELATIVE, never an absolute number
 *
 * Absolute throughput (msgs/sec) and absolute memory (bytes) vary by an order of
 * magnitude across machines, background load, and (critically) whether v8
 * coverage instrumentation is active (`pnpm test:coverage` instruments `src/**`,
 * inflating every parse time several-fold). A committed absolute floor would
 * either be so low it catches nothing, or flaky on a slow/contended runner. So
 * the guards below are **ratios of two measurements taken in the same process**,
 * where machine speed and instrumentation overhead **cancel**:
 *
 *   - **Throughput linearity, by message count**: parsing 4× the messages must
 *     take ≈4× the time, not more. `t(4N)/t(N) ≤ LINEARITY_MAX` (= 10, 2.5× the
 *     ideal 4) catches a super-linear regression in message *count*. Both timings
 *     parse the same code, so a slow or instrumented runner scales both equally.
 *   - **Throughput linearity, by message size**: the complement: one message of
 *     size S vs 4S, each parsed an equal number of times, so the ratio isolates
 *     *length*. This is what catches an accidental **O(n²)-in-message-length**
 *     tokenizer regression (which the count test, at fixed size, cannot see).
 *   - **Streaming read-ahead**: `parseStream` must pull its source lazily and
 *     retain **O(one message)**, not buffer the file. Measured by counting how far
 *     the source is pulled *ahead* of what's been yielded: a pure count (`≤ 2`),
 *     immune to GC timing and machine memory. This is the streaming **memory**
 *     guard: if `parseStream` started buffering the file, read-ahead would grow
 *     toward N and trip. (An earlier draft asserted a retained-heap *ratio*, but
 *     `heapUsed` deltas without a forced GC measure uncollected young-gen garbage,
 *     not live retained state, and false-fail under a larger `--max-semi-space-size`
 *: the conformance-refuter caught this. The read-ahead count covers the same
 *     regression robustly; the *absolute* heap numbers live in the benchmark, which
 *     forces GC via `--expose-gc`, not in this gate.)
 *
 * Each linearity timing is the parser's own time: the **minimum** over several
 * passes, with the small and large passes **interleaved** and the main-thread
 * **GC pauses subtracted** (`timeParsePair`). Interleaving makes a load change
 * from test files running in parallel land on both sides, not on one block. GC is
 * excluded because its cost does not follow the parser's algorithm: a 500-OBX
 * tree mostly dies inside one young-gen cycle, while a 2000-OBX tree survives
 * the scavenges that run while it is built, so it is copied and promoted. On
 * hosted CI runners a pass over the 2000-OBX messages spent a median 14× (Node 22)
 * to 37× (Node 24) the GC time of a pass over the 500-OBX ones, for 4× the bytes,
 * and with GC left in, the size ratio of an unchanged parser reached 10.08 to
 * 11.63. Over 30 full-suite runs there, the parser-time ratio peaked at 5.87.
 *
 * There is one deliberately **coarse absolute liveness floor** (parse ≥ a few
 * dozen msgs/sec) with ~100× headroom even under coverage on a loaded runner: it
 * only trips on a catastrophic hang a ratio could miss, never on ordinary slowness.
 *
 * This phase adds **no runtime behavior**: the guard only measures the shipped
 * parser + streamer. See `docs-content/benchmarks.md` for the methodology writeup.
 */

import { PerformanceObserver, type PerformanceEntry } from "node:perf_hooks";

import { beforeAll, describe, expect, it } from "vitest";

import { parseHL7, parseStream } from "../../src/index.js";

/**
 * Ideal linear ratio is 4 (4× the work). 10 leaves 2.5× headroom for cold-JIT /
 * scheduler noise while staying well below the ~16 a genuine super-linear
 * (O(n²)) regression on a 4× workload produces: so the guard is roomy against
 * false alarms yet still trips on a real quadratic blow-up.
 */
const LINEARITY_MAX = 10;
/** Coarse liveness floor: ~100× below real instrumented throughput. Not a perf target. */
const MIN_MSGS_PER_SEC = 40;

/** Synthetic ADT^A01 (5 segments). No PHI: every value is fabricated. */
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

/** Synthetic ORU^R01 with `obxCount` OBX result lines (default 8). No PHI. */
function oruMessage(i: number, obxCount = 8): string {
  const id = String(i).padStart(6, "0");
  const obx = Array.from(
    { length: obxCount },
    (_v, k) =>
      `OBX|${String(k + 1)}|NM|GLU^Glucose^LN||${String(80 + (k % 40))}|mg/dL|70-110|N|||F|||20260101120000`,
  ).join("\r");
  return (
    `MSH|^~\\&|LAB|SENDFAC|EHR|RECVFAC|20260101120000||ORU^R01|R${id}|P|2.5\r` +
    `PID|1||FAKE${id}^^^HOSP^MR||Roe^Sam^T||19750615|M\r` +
    `OBR|1||ACC${id}|CBC^Complete Blood Count^LN|||20260101120000\r` +
    `${obx}\r`
  );
}

/** One timed parse of a whole workload, as its span on the `performance.now()` clock. */
interface Pass {
  readonly start: number;
  readonly end: number;
}

/**
 * Parse every message in `msgs` once and return the span it took. The parsed
 * segment count is summed into a sink so the parse can't be eliminated as dead
 * code.
 */
function timedPass(msgs: readonly string[]): Pass {
  let sink = 0;
  const start = performance.now();
  for (const m of msgs) sink += parseHL7(m).rawSegments.length;
  const end = performance.now();
  expect(sink).toBeGreaterThan(0);
  return { start, end };
}

/** Milliseconds of `pass` that fall inside a recorded GC pause. */
function gcPauseWithin(pass: Pass, pauses: readonly PerformanceEntry[]): number {
  let total = 0;
  for (const p of pauses) {
    const overlap =
      Math.min(pass.end, p.startTime + p.duration) - Math.max(pass.start, p.startTime);
    if (overlap > 0) total += overlap;
  }
  return total;
}

/**
 * **Minimum** parser milliseconds for `small` and for `large` over `rounds`
 * passes each, after an unmeasured warm-up of both.
 *
 * - Benchmark noise is one-sided: a scheduler preemption only ever *adds* time:
 *   so the minimum is the cleanest estimator of true compute cost, and taking it
 *   on both sides of the linearity ratio cancels transient stalls.
 * - The two workloads alternate pass by pass (and swap order each round), so a
 *   load change from test files running in parallel lands on both sides. Timed
 *   as two blocks, the large block could fall entirely in a busy window and
 *   inflate `t(large)` alone.
 * - Main-thread GC pauses inside a pass are subtracted. Their cost depends on V8's
 *   young-gen sizing and on free helper threads, not on the parser's algorithm,
 *   and it grows faster than linearly in message size: a large tree survives the
 *   scavenges that run while it is built, a small one mostly does not. A
 *   quadratic tokenizer still shows: its extra work is parser time.
 *
 * GC entries reach the observer asynchronously, so the pauses are read after the
 * timed passes, once the event loop has delivered them.
 */
async function timeParsePair(
  small: readonly string[],
  large: readonly string[],
  rounds: number,
): Promise<{ tSmall: number; tLarge: number }> {
  const pauses: PerformanceEntry[] = [];
  const observer = new PerformanceObserver((list) => {
    pauses.push(...list.getEntries());
  });
  observer.observe({ entryTypes: ["gc"] });
  try {
    timedPass(small); // warm-up
    timedPass(large); // warm-up
    const smallPasses: Pass[] = [];
    const largePasses: Pass[] = [];
    for (let r = 0; r < rounds; r++) {
      if (r % 2 === 0) {
        smallPasses.push(timedPass(small));
        largePasses.push(timedPass(large));
      } else {
        largePasses.push(timedPass(large));
        smallPasses.push(timedPass(small));
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
    pauses.push(...observer.takeRecords());
    const parserTime = (pass: Pass): number => pass.end - pass.start - gcPauseWithin(pass, pauses);
    return {
      tSmall: Math.min(...smallPasses.map(parserTime)),
      tLarge: Math.min(...largePasses.map(parserTime)),
    };
  } finally {
    observer.disconnect();
  }
}

describe("perf guard: parse throughput scales linearly (no super-linear regression)", () => {
  // Tier V8 up before ANY ratio is measured, so the first timed test is not
  // penalized by cold-JIT compilation (which would inflate one run and flake the
  // ratio). Not timed: purely to warm the code paths under test.
  beforeAll(() => {
    let sink = 0;
    for (let r = 0; r < 3; r++) {
      for (let i = 0; i < 500; i++) sink += parseHL7(adtMessage(i)).rawSegments.length;
      for (let i = 0; i < 200; i++) sink += parseHL7(oruMessage(i)).rawSegments.length;
      sink += parseHL7(oruMessage(0, 2_000)).rawSegments.length;
    }
    expect(sink).toBeGreaterThan(0);
  });

  for (const [label, builder] of [
    ["ADT^A01", adtMessage],
    ["ORU^R01", oruMessage],
  ] as const) {
    it(`${label}: t(4N)/t(N) stays near the linear ideal`, async () => {
      const N = 1_000;
      const small = Array.from({ length: N }, (_v, i) => builder(i));
      const large = Array.from({ length: N * 4 }, (_v, i) => builder(i));

      const { tSmall, tLarge } = await timeParsePair(small, large, 5);

      // Guard against a divide-by-~0 on an absurdly fast machine: only assert the
      // ratio once the small run is measurable; the linear ideal is 4.
      if (tSmall > 0.5) {
        const ratio = tLarge / tSmall;
        expect(ratio).toBeLessThanOrEqual(LINEARITY_MAX);
      }

      // Coarse liveness floor (huge headroom): trips only on a catastrophic hang.
      const msgsPerSec = ((N * 4) / tLarge) * 1000;
      expect(msgsPerSec).toBeGreaterThan(MIN_MSGS_PER_SEC);
    }, 30_000);
  }

  it("scales linearly with message SIZE: catches an O(n²)-in-length tokenizer regression", async () => {
    // The count-scaling tests above hold message size fixed, so an accidental
    // super-linear cost in message *length* (e.g. an O(n²) tokenizer) would inflate
    // both runs by the same factor and slip through. This test scales the OTHER
    // axis: one ORU of S OBX lines vs one of 4S, each parsed M times (equal count,
    // so the ratio isolates size). A tokenizer gone quadratic makes 4× the bytes
    // cost ~16× the time (well over the ceiling) while a linear parser stays ~4.
    // Same code both sides, so machine speed and coverage instrumentation cancel.
    const M = 40;
    const small = Array.from({ length: M }, () => oruMessage(0, 500));
    const large = Array.from({ length: M }, () => oruMessage(0, 2_000));

    const { tSmall, tLarge } = await timeParsePair(small, large, 5);

    if (tSmall > 0.5) {
      const ratio = tLarge / tSmall;
      expect(ratio).toBeLessThanOrEqual(LINEARITY_MAX);
    }
  }, 30_000);
});

describe("perf guard: parseStream retains O(one message), never buffers the file", () => {
  it("pulls the source lazily: read-ahead stays a small constant, not O(N)", async () => {
    // If parseStream buffered the whole stream, `produced` would race to N before
    // the first yield, so `produced - received` would approach N. A land-and-release
    // streamer holds that difference at ~1 (it reads the next MSH to close the
    // current message). This is a pure count: immune to GC timing and machine RAM.
    const N = 4_000;
    let produced = 0;
    async function* source(): AsyncGenerator<string> {
      for (let i = 0; i < N; i++) {
        await Promise.resolve();
        produced += 1;
        yield adtMessage(i);
      }
    }
    let received = 0;
    let maxReadAhead = 0;
    for await (const entry of parseStream(source())) {
      expect(entry.ok).toBe(true);
      received += 1;
      maxReadAhead = Math.max(maxReadAhead, produced - received);
    }
    expect(received).toBe(N);
    expect(maxReadAhead).toBeLessThanOrEqual(2);
  }, 30_000);
});
