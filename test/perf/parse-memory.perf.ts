/**
 * How much heap a parsed message holds, against the bytes it was parsed from, run by
 * `pnpm test:perf` and never under coverage (see `vitest.perf.config.ts`): instrumentation adds
 * objects of its own to every function it counts.
 *
 * A parsed message is a tree of plain objects and arrays, so it always holds many times its text.
 * These ceilings catch the tree growing again: an array grown by `push` reserves room for about 17
 * entries whatever it holds, and when every level of the tree was built that way a parse held 106
 * times its input. The ceilings sit above what the parser holds today, by enough that a change of
 * Node version does not trip them, and far below where it stood before.
 *
 * The heap is read after a full collection, before and after one parse that is kept alive, so
 * what is measured is what the message retains, not what the parse threw away. Every input is
 * synthetic and built here from an index.
 */

import { setFlagsFromString } from "node:v8";
import { runInNewContext } from "node:vm";

import { describe, expect, it } from "vitest";

import { parseHL7, type Hl7Message, type ParseOptions } from "../../src/index.js";

setFlagsFromString("--expose-gc");
const collect = runInNewContext("gc") as () => void;

/** A synthetic ADT^A01 of five segments. No PHI. */
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

/** A synthetic ORU^R01 of about `bytes` bytes, every result a short OBX line. No PHI. */
function denseMessage(bytes: number): string {
  const lines = [
    "MSH|^~\\&|LAB|SENDFAC|EHR|RECVFAC|20260101120000||ORU^R01|R000001|P|2.5",
    "PID|1||FAKE000001^^^HOSP^MR||Roe^Sam^T||19750615|M",
    "OBR|1||ACC000001|CBC^Complete Blood Count^LN|||20260101120000",
  ];
  for (let k = 0, n = 0; n < bytes; k++) {
    const line = `OBX|${String(k + 1)}|NM|GLU^Glucose^LN||${String(80 + (k % 40))}|mg/dL|70-110|N|||F|||20260101120000`;
    lines.push(line);
    n += line.length + 1;
  }
  return `${lines.join("\r")}\r`;
}

/** A synthetic ORU^R01 carrying one generated base64 document of `bytes` bytes. No PHI. */
function documentMessage(bytes: number): string {
  const data = Buffer.alloc(bytes);
  for (let k = 0; k < bytes; k++) data[k] = (k * 7919 + 13) & 0xff;
  return (
    "MSH|^~\\&|LAB|SENDFAC|EHR|RECVFAC|20260101120000||ORU^R01|D000001|P|2.5\r" +
    "PID|1||FAKE000001^^^HOSP^MR||Roe^Sam^T||19750615|M\r" +
    "OBR|1||ACC000001|11502-2^Laboratory report^LN|||20260101120000\r" +
    `OBX|1|ED|11502-2^Laboratory report^LN||^AP^PDF^Base64^${data.toString("base64")}||||||F\r`
  );
}

/**
 * What a typical reader of a result report reads: MSH, PID, PV1 (absent from these reports, so a
 * read that finds nothing) and the first five OBX.
 */
function readTypical(msg: Hl7Message): unknown[] {
  return [
    msg.part("MSH")?.field(10).value,
    msg.part("PID")?.field(3).value,
    msg.part("PV1")?.field(3).value,
    ...msg
      .segments("OBX")
      .slice(0, 5)
      .map((obx) => obx.field(5).value),
  ];
}

/**
 * Heap the parsed messages retain, per byte of the text they were parsed from: parsed with
 * `options`, then read by `read`. The texts are built before the first reading, so they are not
 * counted; a lazy message keeps a reference to its text, which is the caller's own string.
 */
function retainedPerByte(
  texts: readonly string[],
  options: ParseOptions = {},
  read: (msg: Hl7Message) => unknown = () => undefined,
): number {
  // Warm up, so code compiled on first use is not counted as the message's.
  for (let k = 0; k < 3; k++) for (const text of texts) read(parseHL7(text, options));
  collect();
  collect();
  const before = process.memoryUsage().heapUsed;
  const kept: Hl7Message[] = texts.map((text) => parseHL7(text, options));
  for (const msg of kept) read(msg);
  collect();
  collect();
  const after = process.memoryUsage().heapUsed;
  expect(kept.length).toBe(texts.length);
  return (after - before) / texts.reduce((n, text) => n + text.length, 0);
}

describe("the heap a parsed message holds", () => {
  it("is under 70 times the input for a result report of many short OBX lines", () => {
    expect(retainedPerByte([denseMessage(256 * 1024)])).toBeLessThan(70);
  });

  it("is under 80 times the input for a small ADT^A01", () => {
    expect(retainedPerByte(Array.from({ length: 256 }, (_v, i) => adtMessage(i)))).toBeLessThan(80);
  });

  it("is under 3 times the input for a message carrying one large base64 document", () => {
    expect(retainedPerByte([documentMessage(1024 * 1024)])).toBeLessThan(3);
  });

  // A lazy parse builds a segment when it is first read, so what a message holds depends on what
  // was read. The whole tree, built during the parse or by reading everything, is held to the
  // ceilings above.
  it("is under 5 times the input for a 1 MiB result report read at MSH, PID, PV1 and five OBX", () => {
    expect(retainedPerByte([denseMessage(1024 * 1024)], {}, readTypical)).toBeLessThan(5);
  });

  it("is under 70 times the input for a result report built during the parse", () => {
    expect(retainedPerByte([denseMessage(256 * 1024)], { lazy: false })).toBeLessThan(70);
  });

  it("is under 70 times the input for a lazily parsed result report read in full", () => {
    const readAll = (msg: Hl7Message): unknown => msg.rawSegments;
    expect(retainedPerByte([denseMessage(256 * 1024)], {}, readAll)).toBeLessThan(70);
  });

  it("is under 80 times the input for a small ADT^A01 built during the parse", () => {
    const texts = Array.from({ length: 256 }, (_v, i) => adtMessage(i));
    expect(retainedPerByte(texts, { lazy: false })).toBeLessThan(80);
  });
});
