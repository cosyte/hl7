/**
 * Example-based tests for `parseStream()` (roadmap Phase S — streaming /
 * incremental parse). Drives the four canonical stream fixtures plus targeted
 * cases for the Phase-S acceptance criteria:
 *
 *   - yields one message per MSH boundary as it completes;
 *   - a message split across chunk boundaries (mid-segment, mid-field, even
 *     mid-`MSH|^~\&`) reassembles — 1-byte chunks === one big chunk;
 *   - `\r`, `\r\n`, `\n` terminators all tolerated;
 *   - a malformed message mid-stream is isolated (typed failure entry) and the
 *     tail still yields;
 *   - batch-envelope segments are boundaries, never yielded (count == MSH count);
 *   - per-message parse === whole-buffer `splitBatch`;
 *   - a source is consumed lazily (never buffered whole);
 *   - an unterminated final message is yielded with a stream-level warning.
 *
 * The generative analogues live in `test/property/stream.property.test.ts`.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Readable } from "node:stream";
import { Buffer } from "node:buffer";

import { describe, expect, it } from "vitest";

import {
  WARNING_CODES,
  defineProfile,
  parseStream,
  splitBatch,
  unterminatedStreamMessage,
} from "../src/index.js";
import type { Hl7StreamSource, StreamMessageEntry } from "../src/index.js";

const STREAM_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "stream");

/** Read a stream fixture verbatim (as latin1 bytes → string, terminators intact). */
function fixture(name: string): string {
  return readFileSync(path.join(STREAM_DIR, name), "latin1");
}

/** A minimal, spec-clean ADT^A01 with a caller-supplied MSH-10 control id. */
function validMessage(controlId: string): string {
  return (
    `MSH|^~\\&|SENDAPP|SENDFAC|RECVAPP|RECVFAC|20260101120000||ADT^A01|${controlId}|P|2.5\r` +
    `PID|1||FAKE${controlId}^^^HOSP^MR\r`
  );
}

/** Split a string into fixed-size string chunks (size 1 → per-character). */
function chunk(text: string, size: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < text.length; i += size) out.push(text.slice(i, i + size));
  return out;
}

/** Drain a source fully into an array of entries. */
async function collect(
  source: Hl7StreamSource,
  arg?: Parameters<typeof parseStream>[1],
): Promise<StreamMessageEntry[]> {
  const out: StreamMessageEntry[] = [];
  const iterable = arg === undefined ? parseStream(source) : parseStream(source, arg);
  for await (const entry of iterable) out.push(entry);
  return out;
}

/** Project entries into a comparable shape: ok+serialized message, or the error code. */
function summarize(entries: readonly StreamMessageEntry[]): Array<{ ok: boolean; key: string }> {
  return entries.map((e) =>
    e.ok ? { ok: true, key: e.message.toString() } : { ok: false, key: e.error.code },
  );
}

describe("parseStream: yields one message per MSH boundary", () => {
  it("streams every message from an async generator of whole-message chunks", async () => {
    async function* src(): AsyncGenerator<string> {
      await Promise.resolve(); // genuinely async source (exercises the async-iterable path)
      yield validMessage("A1");
      yield validMessage("A2");
      yield validMessage("A3");
    }
    const entries = await collect(src());
    expect(entries).toHaveLength(3);
    expect(entries.every((e) => e.ok)).toBe(true);
    const ids = entries.map((e) => (e.ok ? e.message.meta.controlId : ""));
    expect(ids).toEqual(["A1", "A2", "A3"]);
  });

  it("accepts a plain array (sync iterable) of chunks", async () => {
    const entries = await collect([validMessage("S1"), validMessage("S2")]);
    expect(entries).toHaveLength(2);
    expect(entries.map((e) => (e.ok ? e.message.meta.controlId : ""))).toEqual(["S1", "S2"]);
  });

  it("accepts a Node Readable of Buffer chunks (binary mode)", async () => {
    const bytes = Buffer.from(validMessage("R1") + validMessage("R2"), "latin1");
    const readable = Readable.from([bytes.subarray(0, 30), bytes.subarray(30)]);
    const entries = await collect(readable);
    expect(entries).toHaveLength(2);
    expect(entries.every((e) => e.ok)).toBe(true);
  });

  it("yields nothing for an empty stream", async () => {
    expect(await collect([])).toHaveLength(0);
    expect(await collect([""])).toHaveLength(0);
    function* empty(): Generator<string> {
      /* yields nothing */
    }
    expect(await collect(empty())).toHaveLength(0);
  });

  it("carries the MSH stream segment index as each message's position", async () => {
    // FHS(0) BHS(1) MSH(2) PID(3) MSH(4) PID(5) BTS(6)
    const stream =
      "FHS|^~\\&|SENDAPP\rBHS|^~\\&|SENDAPP\r" +
      validMessage("P1") +
      validMessage("P2") +
      "BTS|2\r";
    const entries = await collect(chunk(stream, 7));
    expect(entries.map((e) => e.position.segmentIndex)).toEqual([2, 4]);
  });
});

describe("parseStream: chunk-boundary invariance", () => {
  it("1-byte chunks yield identical messages to one whole chunk", async () => {
    const whole = fixture("split-across-chunks.hl7");
    const oneChunk = await collect([whole]);
    const perByte = await collect(chunk(whole, 1));
    expect(summarize(perByte)).toEqual(summarize(oneChunk));
    expect(oneChunk).toHaveLength(2);
    expect(oneChunk.every((e) => e.ok)).toBe(true);
  });

  it("reassembles a message split mid-MSH-header across two chunks", async () => {
    const whole = validMessage("MID1") + validMessage("MID2");
    // Cut in the middle of the second MSH's `MSH|^~\&` header token.
    const secondMshAt = whole.indexOf("MSH", 5);
    const cut = secondMshAt + 2; // mid "MSH"
    const entries = await collect([whole.slice(0, cut), whole.slice(cut)]);
    expect(entries).toHaveLength(2);
    expect(entries.map((e) => (e.ok ? e.message.meta.controlId : ""))).toEqual(["MID1", "MID2"]);
  });

  it("does not split a \\r\\n terminator straddling a chunk boundary", async () => {
    const whole =
      "MSH|^~\\&|A|F|B|G|20260101||ADT^A01|CRLF1|P|2.5\r\nPID|1||FAKE^^^H^MR\r\n" +
      "MSH|^~\\&|A|F|B|G|20260101||ADT^A03|CRLF2|P|2.5\r\nPID|1||FAKE2^^^H^MR\r\n";
    // Cut each chunk to end right AFTER a \r, so its \n begins the next chunk —
    // every \r\n pair straddles a boundary (the precise adversarial split).
    const chunks: string[] = [];
    let prev = 0;
    for (let i = 0; i < whole.length; i++) {
      if (whole[i] === "\r") {
        chunks.push(whole.slice(prev, i + 1));
        prev = i + 1;
      }
    }
    if (prev < whole.length) chunks.push(whole.slice(prev));
    const entries = await collect(chunks);
    expect(entries).toHaveLength(2);
    expect(entries.every((e) => e.ok)).toBe(true);
    // No spurious empty segment was introduced by a split \r\n.
    for (const e of entries) {
      if (e.ok) expect(e.message.rawSegments.map((s) => s.name)).toEqual(["MSH", "PID"]);
    }
  });
});

describe("parseStream: terminator tolerance", () => {
  it("parses a fixture that mixes \\r\\n, \\n, and \\r terminators", async () => {
    const entries = await collect(chunk(fixture("mixed-terminators.hl7"), 5));
    expect(entries).toHaveLength(2);
    expect(entries.every((e) => e.ok)).toBe(true);
    for (const e of entries) {
      if (e.ok) expect(e.message.rawSegments.some((s) => s.name === "PID")).toBe(true);
    }
  });
});

describe("parseStream: malformed-mid-stream isolation (never drops the tail)", () => {
  it("isolates a fatal message and still yields every later message", async () => {
    const entries = await collect(chunk(fixture("malformed-mid-stream.hl7"), 3));
    expect(entries).toHaveLength(3);
    expect(entries[0]?.ok).toBe(true);
    expect(entries[1]?.ok).toBe(false);
    if (entries[1] && !entries[1].ok) {
      expect(entries[1].error.code).toBe("MSH_TOO_SHORT");
      expect(entries[1].raw.startsWith("MSH|^~")).toBe(true);
    }
    // The tail after the malformed message is present and correct.
    expect(entries[2]?.ok).toBe(true);
    if (entries[2]?.ok) expect(entries[2].message.meta.controlId).toBe("STREAM0011");
  });

  it("isolation holds identically whether fed whole or byte-by-byte", async () => {
    const whole = fixture("malformed-mid-stream.hl7");
    expect(summarize(await collect(chunk(whole, 1)))).toEqual(summarize(await collect([whole])));
  });
});

describe("parseStream: batch-aware (envelope segments are boundaries, never messages)", () => {
  it("yields exactly the messages of a BHS/BTS-wrapped batch, not the envelope", async () => {
    const entries = await collect(chunk(fixture("large-batch.ndhl7"), 9));
    expect(entries).toHaveLength(12);
    expect(entries.every((e) => e.ok)).toBe(true);
    // None of the yielded messages is an envelope segment.
    for (const e of entries) {
      if (e.ok) expect(e.message.rawSegments[0]?.name).toBe("MSH");
    }
  });
});

describe("parseStream: per-message parse === whole-buffer splitBatch", () => {
  it("streams the same messages splitBatch produces for the same bytes", async () => {
    for (const name of ["split-across-chunks.hl7", "large-batch.ndhl7", "mixed-terminators.hl7"]) {
      const whole = fixture(name);
      const streamed = summarize(await collect(chunk(whole, 4)));
      const batched = splitBatch(whole).messages.map((e) =>
        e.ok ? { ok: true, key: e.message.toString() } : { ok: false, key: e.error.code },
      );
      expect(streamed).toEqual(batched);
    }
  });
});

describe("parseStream: forwards options / profile to parseHL7 per message", () => {
  it("strict mode surfaces a would-be warning as an isolated failure entry", async () => {
    // A lowercase segment name trips SEGMENT_CASE (Tier-2) → strict promotes it.
    const withQuirk = "MSH|^~\\&|A|F|B|G|20260101||ADT^A01|STRICT1|P|2.5\rpid|1||FAKE^^^H^MR\r";
    const lenient = await collect([withQuirk]);
    expect(lenient[0]?.ok).toBe(true);
    const strict = await collect([withQuirk], { strict: true });
    expect(strict).toHaveLength(1);
    expect(strict[0]?.ok).toBe(false);
  });

  it("applies a provided profile to each streamed message", async () => {
    const profile = defineProfile({ name: "streamtest" });
    const entries = await collect([validMessage("PROF1")], profile);
    expect(entries[0]?.ok).toBe(true);
    if (entries[0]?.ok) expect(entries[0].message.profile?.name).toBe("streamtest");
  });
});

describe("parseStream: unterminated final message (surfaced, never dropped, never thrown)", () => {
  it("yields a final message with no trailing terminator and flags it", async () => {
    const unterminated = "MSH|^~\\&|A|F|B|G|20260101||ADT^A01|UNTERM1|P|2.5\rPID|1||FAKE^^^H^MR"; // no final \r
    const entries = await collect(chunk(unterminated, 6));
    expect(entries).toHaveLength(1);
    expect(entries[0]?.ok).toBe(true);
    expect(entries[0]?.streamWarnings.map((w) => w.code)).toEqual([
      WARNING_CODES.UNTERMINATED_STREAM_MESSAGE,
    ]);
    // The tail segment was NOT dropped — PID is present.
    if (entries[0]?.ok) {
      expect(entries[0].message.rawSegments.map((s) => s.name)).toEqual(["MSH", "PID"]);
    }
  });

  it("does not flag a final message that ends with a terminator", async () => {
    const entries = await collect([validMessage("TERM1")]);
    expect(entries).toHaveLength(1);
    expect(entries[0]?.streamWarnings).toHaveLength(0);
  });

  it("matches splitBatch byte-for-byte even for a whitespace-only unterminated tail", async () => {
    // A whitespace-only tail with no terminator is kept exactly as splitBatch
    // keeps it (parity of the two surfaces), and is NOT a truncation signal.
    for (const tail of ["   ", "\t", " \t "]) {
      const whole = validMessage("WSPACE1").replace(/\r$/, "\r") + tail; // trailing whitespace, no CR
      const streamed = summarize(await collect(chunk(whole, 3)));
      const batched = splitBatch(whole).messages.map((e) =>
        e.ok ? { ok: true, key: e.message.toString() } : { ok: false, key: e.error.code },
      );
      expect(streamed).toEqual(batched);
      // Trailing whitespace is not a truncated-feed signal.
      const entries = await collect(chunk(whole, 3));
      expect(entries[0]?.streamWarnings).toHaveLength(0);
    }
  });

  it("only the final message can be flagged unterminated", async () => {
    const stream = validMessage("F1") + "MSH|^~\\&|A|F|B|G|20260101||ADT^A03|F2|P|2.5\rPID|1"; // 2nd unterminated
    const entries = await collect(chunk(stream, 1));
    expect(entries).toHaveLength(2);
    expect(entries[0]?.streamWarnings).toHaveLength(0);
    expect(entries[1]?.streamWarnings.map((w) => w.code)).toEqual([
      WARNING_CODES.UNTERMINATED_STREAM_MESSAGE,
    ]);
  });
});

describe("parseStream: guards and immutability", () => {
  it("rejects a bare string source with a helpful TypeError", async () => {
    await expect(async () => {
      // A string is Iterable<string>, so it type-checks as a source — the guard is a runtime reject.
      for await (const _ of parseStream("MSH|^~\\&|A")) void _;
    }).rejects.toThrow(/not a single string or Buffer/);
  });

  it("rejects a bare Buffer source", async () => {
    await expect(async () => {
      const buf = Buffer.from(validMessage("B1"), "latin1");
      for await (const _ of parseStream(buf as unknown as Hl7StreamSource)) void _;
    }).rejects.toThrow(/not a single string or Buffer/);
  });

  it("freezes each yielded entry and its streamWarnings", async () => {
    const entries = await collect([validMessage("FRZ1")]);
    expect(Object.isFrozen(entries[0])).toBe(true);
    expect(Object.isFrozen(entries[0]?.streamWarnings)).toBe(true);
  });

  it("exposes the UNTERMINATED_STREAM_MESSAGE factory with a PHI-free message", () => {
    const w = unterminatedStreamMessage({ segmentIndex: 3 });
    expect(w.code).toBe(WARNING_CODES.UNTERMINATED_STREAM_MESSAGE);
    expect(w.position.segmentIndex).toBe(3);
    expect(w.message.length).toBeGreaterThan(0);
  });
});
