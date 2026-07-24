# Benchmarks & performance

`@cosyte/hl7` is the reference cosyte parser, and interface-engine adoption asks a fair question:
**is it fast enough, and does it stay bounded on a large feed?** This page answers both, with a
reproducible benchmark suite and a CI guard that stops future changes from silently degrading
performance.

Two things live here:

1. **A reproducible benchmark suite** (`scripts/bench.ts`, run with `pnpm bench`) that measures parse
   throughput, per-message memory, and the streaming peak memory that substantiates
   [`parseStream`](./spec-notes-stream.md)'s O(one-message) claim. Its numbers are **published below
   as indicative context**.
2. **A performance-regression guard** (`test/perf/perf-regression.test.ts`) that runs in CI and fails
   if throughput or streaming memory regresses. It is **ratio-based**, not an absolute floor, so it
   does not flake across CI runners of different speed.

> This is a **measurement** layer. It adds no runtime behavior and changes no parse output. The
> parser and streamer it measures are exactly the shipped ones.

## Published numbers (indicative)

> Indicative run: Node v24.18.0, linux/x64, GC forced (`--expose-gc`), 2026-07-21. **Absolute numbers
> are machine- and load-dependent**. Treat them as a directional baseline, not a portable guarantee
> (that is what the ratio-based guard is for).

| Message class    | N      | msgs/sec | MB/sec | retained heap / msg |
| ---------------- | ------ | -------- | ------ | ------------------- |
| ADT^A01 (5 seg)  | 20,000 | 25,594   | 7.2    | 25.8 KB             |
| ORU^R01 (12 seg) | 10,000 | 5,937    | 4.1    | 75.9 KB             |

Streaming a 20,000-message ADT batch, `parseStream` holds a small fraction of what a whole-buffer
parse of the same bytes retains, the headline O(one-message) property:

| Streaming (`parseStream`) | N      | whole-buffer retained | streaming peak | ratio  |
| ------------------------- | ------ | --------------------- | -------------- | ------ |
| ADT^A01 batch             | 20,000 | 523.0 MB              | 67.2 MB        | 0.129× |

The streaming "peak" is transient allocation between garbage collections (chunk slices, intermediate
strings), not _retained_ state. The **retained** working set is one message plus the in-flight
partial segment, and it does not grow with the file. The whole-buffer figure, by contrast, is O(N):
it holds every parsed message at once. The gap is the point.

Reproduce any of this:

```bash
pnpm bench                          # human-readable table
node --expose-gc node_modules/.bin/tsx scripts/bench.ts   # tighter memory numbers
pnpm bench --markdown               # the results-table body used on this page
```

## Methodology

- **Inputs are synthetic and generated in-process**: a small ADT^A01 (5 segments) and a larger
  multi-OBX ORU^R01 (12 segments), the low and high ends of everyday message size. No PHI, no fixture
  files, so a run is self-contained and reproducible anywhere.
- **Throughput** is `N / median-elapsed`, after an unmeasured warm-up so the JIT is hot; the parsed
  segment count is summed into a sink so the parse cannot be optimized away as dead code.
- **Per-message retained heap** materializes all N parsed messages and divides the retained
  `heapUsed` delta by N.
- **Streaming peak** feeds the batch in fixed 4 KB chunks and samples `heapUsed` at every yielded
  message, keeping the peak delta, then compares it to the heap a whole-buffer `splitBatch` of the
  same bytes retains.

## Why the regression guard is relative, not an absolute floor

Absolute throughput and memory swing by an order of magnitude across machines, background load, and
(critically) whether v8 **coverage instrumentation** is active (`pnpm test:coverage` instruments
`src/**` and inflates every parse several-fold). A committed absolute floor would either be so low it
catches nothing or so high it false-alarms on a slow or contended CI runner. So the guard asserts
**ratios of two measurements taken in the same process**, where machine speed and instrumentation
overhead cancel:

- **Throughput linearity, by message count.** Parsing 4× the messages must take about 4× the time,
  not more: `t(4N)/t(N) ≤ 10` (2.5× the linear ideal of 4, roomy against cold-JIT/GC noise, still
  well below the ~16 a genuine quadratic regression produces). This catches a **super-linear**
  regression in message count while remaining immune to how fast or instrumented the runner is. Both
  timings use the **minimum** of several runs after a warm-up. Benchmark noise is one-sided (a GC
  pause only ever _adds_ time), so the minimum is the cleanest estimator and taking it on both sides
  cancels transient stalls.
- **Throughput linearity, by message size.** The complement, holding count fixed and scaling _length_:
  one ORU of S OBX lines vs one of 4S, each parsed an equal number of times, `t(4S)/t(S) ≤ 10`. This
  is the guard that catches an accidental **O(n²)-in-message-length** tokenizer regression. The
  by-count test, at fixed size, would scale both runs by the same factor and miss it.
- **Streaming read-ahead, the memory guard.** `parseStream` must pull its source lazily and retain
  O(one message), not buffer the file. The guard counts how far the source is pulled _ahead_ of what
  has been yielded: a pure count (`≤ 2`), immune to GC timing and machine RAM. If `parseStream` ever
  started buffering the file, read-ahead would grow toward N and trip. This restates the
  [streaming](./spec-notes-stream.md) invariant as a performance gate.

  > The gate does **not** assert an absolute retained-heap ratio. A `heapUsed` delta taken without a
  > forced GC measures uncollected young-gen garbage, not live retained state, so it swings with the
  > runner's GC budget (a larger `--max-semi-space-size` defers collection and inflates it) and would
  > false-fail with no regression. The **absolute** memory numbers above are measured in the benchmark,
  > which forces a collection via `--expose-gc`; the CI gate relies on the count-based read-ahead
  > invariant, which needs no GC cooperation.

There is one deliberately **coarse absolute liveness floor** (parse ≥ a few dozen msgs/sec, ~100×
below real instrumented throughput). It only trips on a catastrophic hang a ratio could miss, never
on ordinary slowness.

## What these numbers are not

- **Not a portable guarantee.** The published figures are indicative on one machine and corpus;
  arbitrary inputs (very large messages, adversarial nesting) are not characterized here.
- **Not a cross-library bake-off.** Comparing hl7 to other parsers is a separate exercise; this page
  measures hl7 against itself over time.
- **Not a behavior contract.** Nothing here changes how a message parses. See the
  [core concepts](./spec-notes-primer.md) for parse semantics.
