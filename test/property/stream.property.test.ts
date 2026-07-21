/**
 * Property tests for `parseStream()` (roadmap Phase S). The generative
 * analogues of the example-based `test/parser-stream.test.ts` sweep. The
 * headline invariants, restated from the Phase-S acceptance:
 *
 *   1. Chunk-boundary invariance — feeding the same bytes under ANY chunking
 *      (including 1-byte chunks) yields identical messages to one whole chunk,
 *      and identical to the whole-buffer `splitBatch`.
 *   2. Count fidelity — yielded message count == the number of `MSH` boundaries,
 *      for any stream, under any chunking.
 *   3. Isolation — a malformed message injected anywhere never suppresses a
 *      later message: every valid sibling still comes back `ok`, whatever the
 *      chunking.
 *   4. Bounded memory — the source is pulled lazily and at most O(one message)
 *      is retained; the whole stream is never buffered ahead.
 */

import { describe, expect, it } from "vitest";
import fc from "fast-check";

import { parseStream, splitBatch } from "../../src/index.js";
import type { Hl7StreamSource, StreamMessageEntry } from "../../src/index.js";

/** Stable seed + run budget so failures reproduce deterministically. */
const RUN_CONFIG = { numRuns: 200, seed: 0x07_21_2026 } as const;

/** A minimal, spec-clean ADT^A01 with a caller-supplied MSH-10 control id. */
function validMessage(controlId: string): string {
  return (
    `MSH|^~\\&|SENDAPP|SENDFAC|RECVAPP|RECVFAC|20260101120000||ADT^A01|${controlId}|P|2.5\r` +
    `PID|1||FAKE${controlId}^^^HOSP^MR\r`
  );
}

/** A truncated MSH that parseHL7 rejects with a Tier-3 fatal (isolated failure). */
const MALFORMED_MESSAGE = "MSH|^~\r";

/** Control ids are short alphanumerics so they never collide a delimiter. */
const controlId = fc.stringMatching(/^[A-Z0-9]{1,8}$/);

/** Split a string by a cyclic list of chunk lengths (>=1). */
function chunkByLengths(text: string, lengths: readonly number[]): string[] {
  if (lengths.length === 0) return [text];
  const out: string[] = [];
  let i = 0;
  let k = 0;
  while (i < text.length) {
    const len = Math.max(1, lengths[k % lengths.length] ?? 1);
    out.push(text.slice(i, i + len));
    i += len;
    k += 1;
  }
  return out;
}

/** Drain a source fully into an array of entries. */
async function collect(source: Hl7StreamSource): Promise<StreamMessageEntry[]> {
  const out: StreamMessageEntry[] = [];
  for await (const entry of parseStream(source)) out.push(entry);
  return out;
}

/** Project entries into a comparable shape independent of chunking. */
function summarize(entries: readonly StreamMessageEntry[]): Array<{ ok: boolean; key: string }> {
  return entries.map((e) =>
    e.ok ? { ok: true, key: e.message.toString() } : { ok: false, key: e.error.code },
  );
}

describe("property: parseStream chunk-boundary invariance", () => {
  it("any chunking yields the same messages as one whole chunk (and as splitBatch)", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(controlId, { minLength: 1, maxLength: 8 }),
        fc.array(fc.integer({ min: 1, max: 40 }), { maxLength: 12 }),
        async (ids, lengths) => {
          const whole = ids.map(validMessage).join("");
          const chunked = summarize(await collect(chunkByLengths(whole, lengths)));
          const single = summarize(await collect([whole]));
          const batched = splitBatch(whole).messages.map((e) =>
            e.ok ? { ok: true, key: e.message.toString() } : { ok: false, key: e.error.code },
          );
          expect(chunked).toEqual(single);
          expect(chunked).toEqual(batched);
        },
      ),
      RUN_CONFIG,
    );
  });

  it("1-byte chunks yield the same messages as one whole chunk", async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(controlId, { minLength: 1, maxLength: 6 }), async (ids) => {
        const whole = ids.map(validMessage).join("");
        const perByte = summarize(await collect(whole.split("")));
        const single = summarize(await collect([whole]));
        expect(perByte).toEqual(single);
      }),
      RUN_CONFIG,
    );
  });
});

describe("property: parseStream count fidelity", () => {
  it("yields exactly one entry per MSH boundary, under any chunking", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(controlId, { minLength: 1, maxLength: 10 }),
        fc.array(fc.integer({ min: 1, max: 30 }), { maxLength: 10 }),
        async (ids, lengths) => {
          const whole = ids.map(validMessage).join("");
          const entries = await collect(chunkByLengths(whole, lengths));
          expect(entries).toHaveLength(ids.length);
          expect(entries.every((e) => e.ok)).toBe(true);
        },
      ),
      RUN_CONFIG,
    );
  });

  it("count == MSH count inside a BHS/BTS batch envelope (envelope not yielded)", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(controlId, { minLength: 1, maxLength: 8 }),
        fc.array(fc.integer({ min: 1, max: 25 }), { maxLength: 8 }),
        async (ids, lengths) => {
          const body = ids.map(validMessage).join("");
          const stream = `BHS|^~\\&|SENDAPP\r${body}BTS|${String(ids.length)}\r`;
          const entries = await collect(chunkByLengths(stream, lengths));
          expect(entries).toHaveLength(ids.length);
          expect(entries.every((e) => e.ok)).toBe(true);
        },
      ),
      RUN_CONFIG,
    );
  });
});

describe("property: parseStream isolation (a malformed message never suppresses siblings)", () => {
  it("returns every valid message plus the malformed one, at any injection point and chunking", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(controlId, { minLength: 1, maxLength: 8 }),
        fc.nat(),
        fc.array(fc.integer({ min: 1, max: 30 }), { maxLength: 10 }),
        async (ids, rawPosition, lengths) => {
          const injectAt = rawPosition % (ids.length + 1);
          const parts = ids.map(validMessage);
          parts.splice(injectAt, 0, MALFORMED_MESSAGE);
          const whole = parts.join("");

          const entries = await collect(chunkByLengths(whole, lengths));
          const ok = entries.filter((e) => e.ok);
          const bad = entries.filter((e) => !e.ok);

          // Every valid message survives; exactly one failure entry; nothing dropped.
          expect(ok).toHaveLength(ids.length);
          expect(bad).toHaveLength(1);
          expect(entries).toHaveLength(ids.length + 1);
          // The surviving control ids are exactly the input, in order.
          expect(ok.map((e) => (e.ok ? e.message.meta.controlId : ""))).toEqual(ids);
        },
      ),
      RUN_CONFIG,
    );
  });
});

describe("property: parseStream bounded memory (O(one message), never buffers the stream)", () => {
  it("pulls the source lazily — at each yield, at most one message is read ahead", async () => {
    // If parseStream buffered the whole stream, `produced` would reach N before
    // the first message is yielded, so `produced - received` would be ~N. A
    // land-and-release streamer keeps that difference at a small constant (it
    // must read the NEXT message's MSH to close the current one, so exactly 1).
    const N = 4000;
    let produced = 0;
    async function* source(): AsyncGenerator<string> {
      for (let i = 0; i < N; i++) {
        await Promise.resolve(); // a genuinely async source — the real streaming shape
        produced += 1;
        yield validMessage(`M${String(i)}`);
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
    // Constant read-ahead — decisively not O(N).
    expect(maxReadAhead).toBeLessThanOrEqual(2);
  });
});
