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
built `dist/index.mjs`, the entry a consumer imports. It has four parse benchmarks: `parseHL7`, the
parse followed by the reads most callers make (MSH, PID, PV1 and five OBX), `parseHL7` with
`{ lazy: false }`, and the parse followed by `toString()`. Each runs at seven sizes: an `ADT^A01` of
280 bytes, an `ORU^R01` of 1.6 KiB with every identifying segment filled (PID, PV1, NK1, GT1 and
IN1), `ORU^R01` result reports of 32 KiB, 1 MiB and 4 MiB, and `ORU^R01` messages of 1 MiB and
4 MiB that carry one base64 document. Every message is synthetic and built in the process. The
1.6 KiB report is the message a de-identifying pipeline reads whole and writes back one at a time,
so its peak heap in a reading is what one such message costs, the fixed cost of a call included.

Two ACK benchmarks answer a message, the call an interface engine makes once for every message it
takes in: `buildAck` then `toString()` on a header parsed beforehand, and the parse of a header, a
negative `buildAck` with one ERR segment, then `toString()`. Each runs over 64 `ADT^A01` headers,
one a call, and both are in the shared comparison. We added them after an engine built on this
package measured each ACK a few microseconds slower once it upgraded from 0.1.9, with no benchmark
here to show it. From 0.1.12 the control id drew its random characters with one
`crypto.getRandomValues` call for every id, where `node:crypto`'s `randomInt` before it served them
from a pool; it now draws a pool of its own. `buildAck` also no longer builds the inbound header's
`meta`, which parses MSH-7's date and, from 0.1.13, MSH-21, to read the three values it echoes.

- **A reading** (`pnpm build && pnpm bench:reading`) measures one build: throughput, latency
  percentiles, allocations per call, the peak memory of one call, whether the heap stays flat over a
  long run, and the cold import.
- **A comparison** times the base build against the head build, interleaved in fresh processes on
  one machine, and calls a regression only when the whole interval on the median change is above
  3%. On a pull request it runs on a GitHub-hosted runner in two jobs: CI's `bench-compare` over the
  280 B, 1.6 KiB, 32 KiB and 1 MiB document sizes, and `large-compare` in the `bench-reading` workflow over
  the 1 MiB and 4 MiB result reports and the 4 MiB document (`bench/parse-large.compare.mjs`). The
  large cases each take one call at a time to warm up, until the median of the last five calls is
  within 5% of the five before them, which does not fit the shared job's time budget.

Two large cases often do not settle: `parseHL7 with { lazy: false }` at 1 MiB and `parseHL7` at
4 MiB take too long a call for the standard warmup to settle on a busy runner and too short a call
for the large-case plan, so a comparison skips them (`warmup-unstable`). A skip is not a pass; the
calibration below counts them.

Both comparisons are advisory: they report a regression on the run's page and never fail the pull
request. A comparison may become a required check only when an A/A calibration on its runner class
shows false alarms under 1% with 95% confidence, which takes at least 299 clean comparisons.

### The large comparison's false alarm rate

The `bench-calibration` workflow measures it: six GitHub-hosted runners each run whole A/A
comparisons of `bench/parse-large.compare.mjs` for an hour, both sides the same build from two
directories, so every regression verdict is a false alarm, and its `summary` job pools them
(`bench/calibration-summary.mjs`).

Its first run (bench-calibration run 43063981807, Node 22, `ubuntu-latest`) finished 38
comparisons:

- **No false alarm in 408 case verdicts that measured**, an upper bound of 0.73% on the per-case
  rate with 95% confidence.
- **Every comparison skipped a case**, so none counts toward the per-comparison rate, and the rule
  for a required check (both that rate and the rate of comparisons that skip a case under 1%) is not
  met. `parseHL7 with { lazy: false }` at 1 MiB was skipped in 35 of 38 comparisons and `parseHL7`
  at 4 MiB in 13: their calls are too long for the standard warmup to settle on a busy runner and
  too short for the large-case plan.
- **One round's noise** with nothing changed, the 5th to 95th percentile of the round ratios, is in
  the table: about 4% either side for most result report cases, and wider for the eager parses and
  for the 4 MiB document's sub-millisecond calls.

| Benchmark                                      | Size                                  | Verdicts | False alarms | Skips | Round ratio, 5th to 95th percentile |
| ---------------------------------------------- | ------------------------------------- | -------: | -----------: | ----: | ----------------------------------- |
| parseHL7                                       | ORU^R01, 1 MiB                        |       38 |            0 |     0 | 0.953 to 1.045                      |
| parseHL7                                       | ORU^R01, 4 MiB                        |       25 |            0 |    13 | 0.967 to 1.038                      |
| parseHL7                                       | ORU^R01 with a base64 document, 4 MiB |       38 |            0 |     0 | 0.779 to 1.284                      |
| parseHL7, then read MSH, PID, PV1 and five OBX | ORU^R01, 1 MiB                        |       38 |            0 |     0 | 0.960 to 1.037                      |
| parseHL7, then read MSH, PID, PV1 and five OBX | ORU^R01, 4 MiB                        |       38 |            0 |     0 | 0.926 to 1.092                      |
| parseHL7, then read MSH, PID, PV1 and five OBX | ORU^R01 with a base64 document, 4 MiB |       38 |            0 |     0 | 0.780 to 1.281                      |
| parseHL7 with { lazy: false }                  | ORU^R01, 1 MiB                        |        3 |            0 |    35 | 0.788 to 1.335                      |
| parseHL7 with { lazy: false }                  | ORU^R01, 4 MiB                        |       38 |            0 |     0 | 0.881 to 1.148                      |
| parseHL7 with { lazy: false }                  | ORU^R01 with a base64 document, 4 MiB |       38 |            0 |     0 | 0.780 to 1.288                      |
| parseHL7, then toString                        | ORU^R01, 1 MiB                        |       38 |            0 |     0 | 0.965 to 1.040                      |
| parseHL7, then toString                        | ORU^R01, 4 MiB                        |       38 |            0 |     0 | 0.969 to 1.034                      |
| parseHL7, then toString                        | ORU^R01 with a base64 document, 4 MiB |       38 |            0 |     0 | 0.961 to 1.024                      |

The first `large-compare` runs were A/A comparisons too, the parser on both sides the same code. Five of them (bench-reading runs 43064468140, 43067421711,
43069553065, 43071783873 and 43073735819) called no regression in 54 case verdicts that measured,
and each skipped `parseHL7 with { lazy: false }` at 1 MiB, one of them `parseHL7` at 4 MiB as well.

## The streaming memory gate

`readMessages` and `parseStream` read a batch one message at a time, and `readSegments` reads one
message one segment at a time, so what they hold should track the largest item they read, not the
size of the source. `bench/stream-memory.mjs` checks that on a GitHub-hosted runner, in the
`stream-memory` workflow on every pull request: each reader reads a synthetic source of 100 MiB in
64 KiB chunks, and the memory held is read after two full collections every few items. The message
readers read a batch of mostly `ADT^A01` with a 4 MiB message every 2000th. `readSegments` reads
one message of about 400,000 segments with a 4 MiB segment (a base64 document in one field) every
20000th, and that segment is the item being read when memory is sampled.

Each reader has its own limit, a peak held as a multiple of the largest item it read, judged on
the median of its readings: **2.35** for `readMessages`, **1.45** for `parseStream` and **1.6** for
`readSegments`. A reader that buffered its source would hold toward all 100 MiB. The limits are
`PEAK_LIMITS` in the script.

We set each limit from forty readings of the reader on GitHub-hosted runners, all of the reader
code as it is now and of the gate as it reads now, kept in `bench/stream-memory-readings.json`:
twenty from stream-memory run 43139826801 (commit 55c53ca), and five from each of runs 43140852250
(commit 4f3ec2d), 43143019320 (commit 35104df), 43144602455 (commit 9a2c2c9, on `main`) and
43144961655 (commit 3c25b85, the release pull request opened from that commit). A limit sits midway between the highest
reading and the lowest reading plus one, which is the least a reader holding one more 4 MiB item
would read, rounded to a twentieth. So each side keeps a margin of more than a third of an item:

| Reader         | Forty readings | Lowest plus one | Limit | Room above the highest | Room below one item more |
| -------------- | -------------- | --------------- | ----: | ---------------------: | -----------------------: |
| `readMessages` | 1.75 to 1.99   | 2.75            |  2.35 |                   0.36 |                     0.40 |
| `parseStream`  | 0.82 to 1.09   | 1.82            |  1.45 |                   0.36 |                     0.37 |
| `readSegments` | 1.11 to 1.12   | 2.11            |   1.6 |                   0.48 |                     0.51 |

Every one of the forty readings was taken on Node v22.23.4, and the limits hold for that Node
only: how V8 counts the heap and array buffers can move between Node versions, which would move
every reading with no change to a reader. So the stream-memory workflow sets up exactly Node
22.23.4, each run in `bench/stream-memory-readings.json` records the Node it was read on, and the
gate refuses to judge (exit 2, before it takes a reading) on a Node whose major is not the one
recorded. When the workflow's Node changes, we read the readers again on the new Node, record those
runs, and set the limits from them by the same rule.

Until this change all three shared a limit of 3. At those readings it let `readMessages` hold one
whole message more without failing, and the other two nearly two more.
`test/workflows/bench-large-and-memory.test.ts` checks that each limit follows this rule from the
recorded readings, that every recorded run passes, judged five readings at a time, and that the
same readings with one item added to any one reader fail that reader.

The gate judges each reader on five readings, not one. It reads each reader five times, each
reading in a new Node.js process, the three readers in turn, and judges a reader on the median of
its five ratios: the job fails when that median is over the reader's limit, so three readings of
five must be over the limit to fail it and three within it to pass. A single stray reading cannot
fail unchanged code, and a regression that shows in most readings still fails. The job also fails
when a reader cannot be judged: the Node is not the one the limits were read on, it is missing, it has no limit, it has fewer than five readings, or
any one of its readings did not finish, gave no peak or largest item size, read nothing or failed
an item. A reading that has not finished in two minutes is ended and counts as one that did not
finish, so a reader that hangs fails the job in minutes rather than holding it to the job's own
timeout; a reading takes seconds. A reading that cannot be judged is not outvoted by the other
four. The count is `RUNS` in the script, and every reading is listed in the job's summary.

Memory is read after a second full collection, and the gate judges that reading. A collection
finds array buffers dead but frees them in a sweep that can finish after it returns, so a reading
taken straight after one collection can count buffers nothing holds; a second collection finishes
the first one's sweep before it starts. The summary lists both readings of each, and the most a
single collection left unfreed.

A second step in the same job shows the gate fails a reader holding a single item more than it
does. It runs the gate on `bench/planted-regression.mjs`, the build with each of the three readers
fed its source through a wrapper, `bench/hold-one-more.mjs`, that keeps a copy of the last 4 MiB
of it alive until the reader has yielded its last item: one 4 MiB message for `readMessages` and
`parseStream`, one 4 MiB segment for `readSegments`, to within one 64 KiB chunk. The step fails
unless the gate exits 1 with all three readers over their limits.

The copy is held to the reader's last item, not only while the source is read, because a reader's
peak can come after its source has ended: both sources end on a 4 MiB item. A first version
dropped the copy when the source ended, and in stream-memory run 43147338279 (commit 3bfd166) the
planted `readMessages` read 2.07 to 2.09, within its limit, where the same run read the build's own
`readMessages` at 1.75 to 1.98. The planted `parseStream` read 2.06 to 2.08 and the planted
`readSegments` 2.12 in all five, against the build's own 1.06 to 1.09 and 1.11 to 1.12. A copy
dropped at the end of the source missed the sample that gave `readMessages` its peak.

With the copy held to the reader's last item, in stream-memory run 43149078594 (commit dafe91b),
the planted `readMessages` read 2.99 to 3.01, the planted `parseStream` 2.06 to 2.08 and the
planted `readSegments` 2.12 in all five, each over its limit, and the gate failed all three. The
same run read the build's own readers at 1.76 to 1.99, 0.84 to 1.08 and 1.11 to 1.12, each within
its limit. Against the shared limit of 3, the planted `readMessages` median, 3.005, would have
failed by 0.005, and the planted `parseStream` and `readSegments` would have passed.

Before this change the planted build held more, and only two readers: `readMessages` kept a copy
of the last 12 MiB it read, three of the 4 MiB messages, and `parseStream` read its whole source
before parsing it. In stream-memory runs 43139826801 (commit 55c53ca) and 43140852250 (commit
4f3ec2d), five readings of each reader in each, that planted `readMessages` read 4.07 to 4.10 and
that planted `parseStream` 28.43 to 28.45, against 1.11 to 1.12 for `readSegments`.

The readings in the table below were taken after one collection, the three readers read once each
in one process, and judged against the limit of 3 the three readers shared then. In the table and the paragraphs
after it, the limit means that one.

Peak held over the largest item, lowest to highest, on GitHub-hosted runners, over the readings
named below:

| Reader         | Largest item       | Before                   | Now          |
| -------------- | ------------------ | ------------------------ | ------------ |
| `readMessages` | 4 MiB              | 1.96 to 2.08             | 1.99 to 3.02 |
| `parseStream`  | 4 MiB              | 2.99 to 3.98, not judged | 1.66 to 2.13 |
| `readSegments` | 256 KiB, now 4 MiB | 1.82 to 3.41, not judged | 1.10 to 1.68 |

"Before" is ten stream-memory runs: 43063981717, 43064467751, 43066398448, 43067421821, 43069553162,
43071783838, 43073735956, 43075730143, 43078011314 and 43078476614. "Now" is nineteen stream-memory
readings of the reader code as it merged in commit 5c79e9d, every one taken up to run 43131605201,
in this order: run 43113178670; five attempts of run 43116829693; two attempts of run 43118492093;
five attempts of run 43119481814; run 43123783208, on `main` once that code merged; run 43124134355,
the release pull request; run 43126287798, the pull request that added `toBytes()`; run 43130108265,
on `main` once that merged; run 43130463133, its release pull request; and run 43131605201, a pull
request that changed only doc comments under `src/`. None of the later changes touched a reader.
`parseStream` read 2.10; 2.07, 2.06, 2.06, 2.02 and 1.89; 2.12 and 2.06; 2.13, 2.05, 2.09, 1.66 and
2.12; 2.11; 2.11; 2.11; 2.02; 1.87; and 2.11 times its largest message, 1.66 to 2.13, about two
messages. `readMessages` read 2.00; 2.07, 2.02, 1.99, 2.07 and 1.99; 2.07 and 2.05; 2.00, 2.02,
1.99, 2.02 and 2.00; 1.99; 2.00; 2.06; 2.00; 3.02; and 2.09 on the same batch, 1.99 to 3.02.
`readSegments` read 1.10; 1.11, 1.68, 1.11, 1.11 and 1.65; 1.11 and 1.11; 1.11, 1.49, 1.10, 1.11 and
1.10; 1.10; 1.10; 1.10; 1.32; 1.11; and 1.10, 1.10 to 1.68.

Each reading had to stay at or under 3 for the job to pass. Eighteen of the nineteen did. The
exception is `readMessages` at 3.02 in run 43130463133, over the limit, and that job failed: the
same code read 1.99 to 2.09 in the other eighteen. Its peak was 12.08 MiB, 4.08 MiB above two of its
4 MiB messages, so one reading in nineteen counted about a message more than the rest, enough to
cross the limit.

That message was most likely a buffer nobody held. The benchmark's source builds each 4 MiB message
as a buffer and joins it into a second, and both are dead once the message is sent; the reading was
taken straight after one collection, which can return before the sweep that frees dead buffers
does. Two stream-memory runs on this change read every sample after one collection and again after
a second: run 43138574424 (commit 9dd84da) and run 43139826801 (commit 55c53ca), each with twenty
readings of each reader, every reading in its own process. In every one of the eighty message reader
readings, at some sample one collection left 3.62 to 8.24 MiB of array buffers counted that the
second collection freed, up to two of the 4 MiB messages. Run 43138574424 read the heap apart too,
and there the two readings differed by at most 0.006 MiB.
After one collection, the forty `readMessages` readings read 1.76 to 2.12 and the forty
`parseStream` readings 1.57 to 2.16; after two, 1.75 to 2.01 and 0.82 to 1.09. `readSegments` read
1.11 to 1.68 after one and 1.11 to 1.12 after two. The 3.02 did not come again in those eighty
readings, so its own buffers were not seen; what the runs show is a single collection counting a
4 MiB buffer nobody holds, in every message reader reading, and a reading that lands it on the
sample taken while a 4 MiB message is in hand reads about one message high. The planted
`parseStream`, which holds its whole source, read 0.00 to 4.40 after one collection in the planted
step of those runs, a median within the limit though its highest reading was over it, with up to
100 MiB of dead array buffers counted at one sample; after two collections it read 28.43 to 28.45.

`parseStream` used to hold about a message more than `readMessages`, at and over the limit. It cut
every segment from one buffer that grew with each chunk, and that buffer stayed alive while the
message was yielded. A message read from bytes also decoded a second copy of the text the entry's
`raw` already held. Now a segment is cut from the chunk it arrived in, or joined from its pieces
once it ends. A message read from bytes keeps `raw` itself as its text wherever decoding gives the
same characters: ASCII bytes in any set the parser decodes, and every 8859/1 or verbatim reading.
A message with other bytes, under UTF-8, WINDOWS-1252 or another 8859 set, still holds a decoded
copy beside `raw`. `test/perf/stream-memory.perf.ts`, run by `pnpm test:perf`, holds `parseStream`
under 1.5 times a 2 MiB message, from bytes and from text.

`readSegments` was not judged while its largest segment was 256 KiB. Beside a segment that small,
a few 64 KiB chunks and the text they decode to moved its ratio by more than the limit leaves room
for, and that segment was never the item being read when memory was sampled. With a 4 MiB segment
in hand when memory is sampled, what the reader holds besides it is small beside it, and the nineteen
readings above sit at 1.10 to 1.68, well under the limit, so the gate judges it.

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
