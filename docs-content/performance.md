---
id: performance
title: Performance
sidebar_label: Performance
description: "What we measure on @cosyte/hl7 (throughput, memory, streaming) and how, the CI guard that fails on a regression, and how to run the benchmarks yourself."
---

# Performance

This page describes what we measure on `@cosyte/hl7`, how we measure it, and how to run the
benchmarks yourself. The shared method every Cosyte package follows (throughput, latency
percentiles, memory, import time and bundle size, and how a pull request is compared with `main`)
is written down in the performance standard in
[cosyte/config's decision records](https://github.com/cosyte/config/tree/main/documentation/decisions).
The numbers for the current release are in [Current numbers](#current-numbers) below.

Four things run today: the benchmarks, which time base against head on every pull request; a
regression guard that fails a pull request when parsing cost grows faster than its input; a gate on
how much memory the streaming readers hold; and a budget for how long the package takes to import.

What a parsed message holds depends on what you read. `parseHL7` builds a segment's tree the first
time something reads that segment, so a long report read at a few segments holds those few, and
`{ lazy: false }` builds every segment during the parse.
[Read a large message without building all of it](./read-large-messages.md) says which reads build
everything.

## The benchmarks

`bench/parse.bench.mjs` is our benchmark suite, run by the shared `@cosyte/bench` tool against the
built `dist/index.mjs`, the entry a consumer imports. It has four benchmarks: `parseHL7`, the parse
followed by the reads most callers make (MSH, PID, PV1 and five OBX), `parseHL7` with
`{ lazy: false }`, and the parse followed by `toString()`. Each runs at six sizes: an `ADT^A01` of
280 bytes, `ORU^R01` result reports of 32 KiB, 1 MiB and 4 MiB, and `ORU^R01` messages of 1 MiB and
4 MiB that carry one base64 document. Every message is synthetic and built in the process.

- **A reading** (`pnpm build && pnpm bench:reading`) measures one build: throughput, latency
  percentiles, allocations per call, the peak memory of one call, whether the heap stays flat over a
  long run, and the cold import.
- **A comparison** times the base build against the head build, interleaved in fresh processes on
  one machine, and calls a regression only when the whole interval on the median change is above
  3%. On a pull request it runs on a GitHub-hosted runner in two jobs: CI's `bench-compare` over the
  280 B, 32 KiB and 1 MiB document sizes, and `large-compare` in the `bench-reading` workflow over
  the 1 MiB and 4 MiB result reports and the 4 MiB document (`bench/parse-large.compare.mjs`). The
  large cases each take one call at a time to warm up, until the median of the last five calls is
  within 5% of the five before them, which does not fit the shared job's time budget.

Both comparisons are advisory: they report a regression on the run's page and never fail the pull
request. A comparison may become a required check only when an A/A calibration on its runner class
shows false alarms under 1% with 95% confidence, which takes at least 299 clean comparisons.

### The large comparison's false alarm rate

The `bench-calibration` workflow measures it: six GitHub-hosted runners each run whole A/A
comparisons of `bench/parse-large.compare.mjs` for an hour, both sides the same build from two
directories, so every regression verdict is a false alarm, and its `summary` job pools them
(`bench/calibration-summary.mjs`). The first calibration's numbers are added here from its run.

## The streaming memory gate

`readMessages` and `parseStream` read a batch one message at a time, and `readSegments` reads one
message one segment at a time, so what they hold should track the largest item they read, not the
size of the source. `bench/stream-memory.mjs` checks that on a GitHub-hosted runner, in the
`stream-memory` workflow on every pull request: each reader reads a synthetic source of 100 MiB in
64 KiB chunks (a batch of mostly `ADT^A01` with a 4 MiB message every 2000th for the message readers,
and one message of about a million segments with a 256 KiB segment every 5000th for
`readSegments`), and the memory held is read after a full collection every few items.

The job fails when a reader's peak is more than **3 times** the largest item it read: the item, the
text it came from, and room for the reader's own state. A reader that buffered its source would
hold toward all 100 MiB. It also fails when a reading cannot be judged, because a reader read
nothing or failed an item. The limit is `PEAK_MULTIPLE` in the script.

These are ratios, not absolute budgets. The parse benchmarks' absolute budgets belong in
`@cosyte/bench`'s budgets file, which we have not written yet; when we do, the numbers here feed it
rather than a second format.

## The regression guard

`test/perf/perf-regression.test.ts` runs in CI with the test suite and fails when a change makes
the parser slower in a way that grows with input, or makes streaming buffer the file. It compares
two measurements taken in the same process, so the speed of the runner and coverage
instrumentation cancel out, instead of holding a fixed floor that would either catch nothing or
fail on a slow runner.

| Guard                   | Fails when                                                                       | Why this form                                                                                                                                         |
| ----------------------- | -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Linear in message count | parsing 4 times the messages takes more than 10 times as long                    | 10 is 2.5 times the linear ideal of 4, room for warm-up and scheduler noise, and well under the 16 a quadratic regression gives                       |
| Linear in message size  | one message with 4 times the OBX lines takes more than 10 times as long to parse | the count guard holds size fixed, so it cannot see a tokenizer that is quadratic in message length; this one can                                      |
| Streaming read-ahead    | `parseStream` pulls more than 2 chunks ahead of what it has yielded              | a count, so it does not depend on garbage collection timing or the runner's memory; a stream that buffered the file would read ahead toward all of it |
| Liveness                | parsing falls below 40 messages a second                                         | far below real throughput even under coverage instrumentation, so it trips only on a hang                                                             |

Both linear guards take the minimum of several passes after a warm-up (noise only ever adds time),
interleave the small and large passes so a change in load lands on both sides, and subtract the
time spent in garbage-collection pauses. That last step matters: on hosted CI runners a pass over
the large messages spent 14 to 37 times the collection time of a pass over the small ones for 4
times the bytes, enough on its own to push an unchanged parser past the limit. A quadratic
tokenizer still trips the guard, because its extra work is parser time.

The guard does not assert a retained-heap ratio. A `heapUsed` change read without a forced
collection measures garbage not yet collected, which varies with the runner's settings and would
fail with no regression. The absolute memory numbers come from the benchmark, which forces a
collection.

## The cold import budget

Importing the package costs a process time before it parses anything, which matters most to a
short-lived process: a command-line tool, a serverless function, a test worker.
`pnpm check:cold-import` starts a new Node.js process twenty times, each timing one
`await import()` of the built `dist/index.mjs` with `performance.now()`, and fails when the median
is over 15 ms. CI runs it on a GitHub-hosted runner after every build, interleaved with imports of
an empty module so a slow runner shows as a slow empty import.

These keep the import inside the budget:

- **Nothing collates at load.** The lists sorted while the package loads (the overlay keys, the
  builder pairs, the warning codes) are plain ASCII identifiers, sorted by code unit. The first
  `localeCompare` in a process builds an ICU collator, which cost milliseconds; a test holds that
  the code unit order is the order a collator gives for every one of those lists.
- **`node:crypto` is not imported.** A generated message control ID draws its random suffix from
  the Web Crypto global, `crypto.getRandomValues`, which loads on the first ID rather than on the
  import.
- **The generated tables are JSON.** The message structure registry and its provenance are parsed
  from JSON text at load, which the JSON parser reads far faster than the same tables compiled as
  JavaScript. The published structure schemas, the largest table, are parsed on the first
  `validateMessageStructure` call rather than at import.
- **Built on first use.** Each built-in profile is built the first time it is read
  (`profiles.epic`), and the same frozen profile comes back on every read after it. The
  character set table is built on the first message that declares one in MSH-18.

## What these numbers are not

- **Not a guarantee for every input.** The sizes above stop at 4 MiB a message and 100 MiB a
  stream, and adversarial nesting is not characterized here.
- **Not a comparison with other libraries.** That is a separate suite with its own written method.
- **Not a behavior contract.** Nothing here changes how a message parses.

## Run the benchmarks yourself

```bash
pnpm install --frozen-lockfile
pnpm build
pnpm bench:reading                     # a reading of this build, every size
pnpm bench:stream-memory --mib 1       # the streaming readers on a 1 MiB source, judged
pnpm bench:compare --base <base checkout>/dist/index.mjs --head dist/index.mjs
```

A reading at the large sizes and the streaming readers at 100 MiB take minutes and a few hundred
MiB of memory; we run them on GitHub-hosted runners rather than on a shared machine.

## Current numbers

The numbers for this section are measured on `main` at each release and filled in when the release
is built. They are never typed by hand.
