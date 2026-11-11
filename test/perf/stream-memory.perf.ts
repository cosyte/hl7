/**
 * How much memory `parseStream()` holds while a caller holds the large message it just yielded,
 * against that message's size, run by `pnpm test:perf` and never under coverage.
 *
 * The caller holds the parsed message, and `raw`, the message's text. Both are one copy of the
 * text: the message keeps the very string `raw` is, rather than a second decoding of the same
 * bytes, and the stream keeps nothing of a message once it has yielded it beyond the chunk it is
 * reading. The ceiling is set between one copy and two: when the stream held a second copy, as it
 * did while every segment was cut from one growing buffer, or the message a second decoding, the
 * reading is two or more.
 *
 * The heap and the array buffers are read after a full collection, before the stream starts and
 * after each message it yields, the way `bench/stream-memory.mjs` reads them on a 100 MiB batch.
 * The source is built before the first reading and sent in 64 KiB chunks made as they are read.
 * Every message is synthetic and built here.
 */

import { setFlagsFromString } from "node:v8";
import { runInNewContext } from "node:vm";
import { Buffer } from "node:buffer";

import { describe, expect, it } from "vitest";

import { parseStream } from "../../src/index.js";

setFlagsFromString("--expose-gc");
const gc = runInNewContext("gc") as () => void;

const MIB = 1024 * 1024;
const CHUNK = 64 * 1024;

/** Heap and array buffers held now, after a full collection. */
function held(): number {
  gc();
  gc();
  const usage = process.memoryUsage();
  return usage.heapUsed + usage.arrayBuffers;
}

/** A synthetic ADT^A01. No PHI. */
function adtMessage(i: number): string {
  const id = String(i).padStart(6, "0");
  return (
    `MSH|^~\\&|SENDAPP|SENDFAC|RECVAPP|RECVFAC|20260101120000||ADT^A01|A${id}|P|2.5\r` +
    `PID|1||FAKE${id}^^^HOSP^MR||Doe^Jane^Q||19800101|F\r`
  );
}

/** A synthetic ORU^R01 carrying one base64 document of about `bytes` bytes. No PHI. */
function documentMessage(bytes: number): string {
  return (
    "MSH|^~\\&|LAB|SENDFAC|EHR|RECVFAC|20260101120000||ORU^R01|D000001|P|2.5\r" +
    "PID|1||FAKE000001^^^HOSP^MR||Roe^Sam^T||19750615|M\r" +
    `OBX|1|ED|DOC^Document^LN||^AP^PDF^Base64^${"QUJD".repeat(bytes / 4)}||||||F\r`
  );
}

/** `text` as 64 KiB chunks of bytes (or of text), each made when it is read. */
async function* chunks(text: string, bytes: boolean): AsyncGenerator<string | Buffer> {
  for (let i = 0; i < text.length; i += CHUNK) {
    await Promise.resolve();
    const piece = text.slice(i, i + CHUNK);
    yield bytes ? Buffer.from(piece, "latin1") : piece;
  }
}

/** The most held above the start, after any message is yielded, as a multiple of the largest. */
async function peakPerLargest(bytes: boolean): Promise<number> {
  const doc = documentMessage(2 * MIB);
  const text = adtMessage(1) + doc + adtMessage(2) + adtMessage(3);
  const read = async (): Promise<number> => {
    let peak = 0;
    const before = held();
    for await (const entry of parseStream(chunks(text, bytes))) {
      expect(entry.ok).toBe(true);
      if (entry.ok) entry.message.get("PID.3.1");
      peak = Math.max(peak, held() - before);
    }
    return peak;
  };
  // Warm up, so code compiled on first use is not counted as memory the stream holds.
  await read();
  await read();
  return (await read()) / doc.length;
}

describe("the memory parseStream holds", () => {
  it("is under 1.5 times the largest message, read from bytes", async () => {
    expect(await peakPerLargest(true)).toBeLessThan(1.5);
  });

  it("is under 1.5 times the largest message, read from text", async () => {
    expect(await peakPerLargest(false)).toBeLessThan(1.5);
  });
});
