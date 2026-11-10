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

Two things run today: a benchmark you can run anywhere, and a regression guard that runs in CI on
every pull request.

## The benchmark

`pnpm bench` (`scripts/bench.ts`) measures:

- **Throughput**, in messages and megabytes a second, for a small `ADT^A01` (5 segments) and a
  larger `ORU^R01` (12 segments).
- **Retained heap per message**: all N parsed messages held at once, divided by N.
- **Streaming peak memory**: a large ADT batch fed to `parseStream` in 4 KB chunks, with the heap
  sampled at every message, against the heap a whole-buffer `splitBatch` of the same bytes holds.
  This is the measurement behind `parseStream`'s claim to hold about one message at a time.

How it measures:

- **Inputs are synthetic and generated in the process.** No fixture files and no patient data, so
  a run is the same anywhere.
- **Throughput** is N divided by the median elapsed time, after an unmeasured warm-up. The parsed
  segment count goes into a sink so the parse cannot be optimized away.
- **Memory** is the change in `heapUsed`, tightest when Node.js runs with `--expose-gc` so the
  benchmark can force a collection before it reads the heap.

Absolute numbers depend on the machine and its load, so a figure measured on one machine is
context, not a guarantee.

## The regression guard

`test/perf/perf-regression.test.ts` runs in CI with the test suite and fails when a change makes
the parser slower in a way that grows with input, or makes streaming buffer the file. It compares
two measurements taken in the same process, so the speed of the runner and coverage
instrumentation cancel out, instead of holding a fixed floor that would either catch nothing or
fail on a slow runner.

| Guard | Fails when | Why this form |
| --- | --- | --- |
| Linear in message count | parsing 4 times the messages takes more than 10 times as long | 10 is 2.5 times the linear ideal of 4, room for warm-up and scheduler noise, and well under the 16 a quadratic regression gives |
| Linear in message size | one message with 4 times the OBX lines takes more than 10 times as long to parse | the count guard holds size fixed, so it cannot see a tokenizer that is quadratic in message length; this one can |
| Streaming read-ahead | `parseStream` pulls more than 2 chunks ahead of what it has yielded | a count, so it does not depend on garbage collection timing or the runner's memory; a stream that buffered the file would read ahead toward all of it |
| Liveness | parsing falls below 40 messages a second | far below real throughput even under coverage instrumentation, so it trips only on a hang |

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

## What these numbers are not

- **Not a guarantee for every input.** Very large messages and adversarial nesting are not
  characterized here.
- **Not a comparison with other libraries.** That is a separate suite with its own written method.
- **Not a behavior contract.** Nothing here changes how a message parses.

## Run the benchmarks yourself

```bash
pnpm install --frozen-lockfile
pnpm bench                                               # a readable table
node --expose-gc node_modules/.bin/tsx scripts/bench.ts  # tighter memory numbers
pnpm bench --markdown                                    # the table as Markdown
```

## Current numbers

The numbers for this section are measured on `main` at each release and filled in when the release
is built. They are never typed by hand.
