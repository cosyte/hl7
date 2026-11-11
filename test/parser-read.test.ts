/**
 * `readMessages()` and `readSegments()`: each streamed message or segment is the one `parseHL7`
 * gives for the same bytes, warnings and errors included, from every kind of source and wherever
 * the chunks are cut; a failed message is reported with its byte position and reading goes on,
 * and strict mode stops; the source is pulled only as items are asked for. Every message here is
 * synthetic.
 */

import { Buffer } from "node:buffer";
import { Readable } from "node:stream";

import { encodeFrame } from "@cosyte/mllp";
import { describe, expect, it, vi } from "vitest";

import {
  Hl7ParseError,
  WARNING_CODES,
  defineProfile,
  parseHL7,
  readMessages,
  readSegments,
  splitBatch,
} from "../src/index.js";
import type {
  Hl7Message,
  Hl7ReadSource,
  ParseOptions,
  Profile,
  ReadMessageItem,
  ReadSegmentItem,
} from "../src/index.js";
import { fieldArrivedAltered } from "../src/parser/wire-fidelity.js";

/** A synthetic ADT^A01 with a given control id. */
function adt(id: string): string {
  return (
    `MSH|^~\\&|SENDAPP|SENDFAC|RECVAPP|RECVFAC|20260101120000||ADT^A01|${id}|P|2.5\r` +
    `EVN|A01|20260101120000\r` +
    `PID|1||FAKE${id}^^^HOSP^MR||Doe^Jane||19800101|F\r` +
    `PV1|1|I|WARD^101^A\r`
  );
}

/** A synthetic ORU^R01 with an escape, a multi-byte name and a trimmed field. */
function oru(id: string): string {
  return (
    `MSH|^~\\&|LAB|SENDFAC|EHR|RECVFAC|20260101120000||ORU^R01|${id}|P|2.5||||||UNICODE UTF-8\r` +
    `PID|1||FAKE${id}^^^HOSP^MR||Doe^Jane||19750615|M\rNTE|1||Ren\u00e9e^Zo\u00eb\u{1f600}\r` +
    `OBR|1||ACC${id}|CBC^Count^LN\r` +
    `OBX|1|TX|NOTE^Note^LN||Line one\\.br\\line two \\T\\ more|| x \r` +
    `OBX|2|NM|GLU^Glucose^LN||95|mg/dL\r`
  );
}

/** Every item a reader yields. */
async function drain<T>(items: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const item of items) out.push(item);
  return out;
}

/** What a message gives a reader, for comparing two parses of the same bytes. */
function view(message: Hl7Message): unknown {
  return {
    text: message.toString(),
    json: message.toJSON(),
    warnings: message.warnings,
    version: message.version,
    profile: message.profile,
  };
}

/** What an error carries. */
function errorView(error: unknown): unknown {
  expect(error).toBeInstanceOf(Hl7ParseError);
  const e = error as Hl7ParseError;
  return { code: e.code, message: e.message, position: e.position, snippet: e.snippet };
}

/** A message item as a comparable view. */
function itemView(item: ReadMessageItem): unknown {
  return item.ok ? { ok: true, message: view(item.message) } : { ok: false, ...errorViewOf(item) };
}

function errorViewOf(item: ReadMessageItem): Record<string, unknown> {
  if (item.ok) return {};
  return errorView(item.error) as Record<string, unknown>;
}

/** What `parseHL7` gives for `input`, or the error it throws, as a comparable view. */
function parsed(input: string | Buffer, options?: ParseOptions): unknown {
  try {
    const message = options === undefined ? parseHL7(input) : parseHL7(input, options);
    return { ok: true, message: view(message) };
  } catch (error) {
    return { ok: false, ...(errorView(error) as Record<string, unknown>) };
  }
}

/** `text` in the chunks a list of cut points gives. */
function cutAt(text: string, cuts: readonly number[]): string[] {
  const out: string[] = [];
  let from = 0;
  for (const cut of cuts) {
    out.push(text.slice(from, cut));
    from = cut;
  }
  out.push(text.slice(from));
  return out;
}

/** `bytes` in the chunks a list of cut points gives. */
function cutBytes(bytes: Uint8Array, cuts: readonly number[]): Uint8Array[] {
  const out: Uint8Array[] = [];
  let from = 0;
  for (const cut of cuts) {
    out.push(bytes.subarray(from, cut));
    from = cut;
  }
  out.push(bytes.subarray(from));
  return out;
}

/** A web ReadableStream of `chunks` that counts how many it was asked for and whether it was cancelled. */
function webStream<T>(chunks: readonly T[]): {
  stream: ReadableStream<T>;
  pulled: () => number;
  cancelled: () => boolean;
} {
  let next = 0;
  let cancelled = false;
  const stream = new ReadableStream<T>(
    {
      pull(controller) {
        if (next < chunks.length) controller.enqueue(chunks[next++] as T);
        else controller.close();
      },
      cancel() {
        cancelled = true;
      },
    },
    { highWaterMark: 0 },
  );
  return { stream, pulled: () => next, cancelled: () => cancelled };
}

/** An async source of `chunks` that counts how many were pulled. */
function counted<T>(chunks: readonly T[]): { source: AsyncIterable<T>; pulled: () => number } {
  let pulled = 0;
  async function* source(): AsyncGenerator<T> {
    for (const chunk of chunks) {
      await Promise.resolve();
      pulled += 1;
      yield chunk;
    }
  }
  return { source: source(), pulled: () => pulled };
}

/** Where each message of a batch starts, by its MSH. */
function starts(text: string): number[] {
  const out: number[] = [];
  for (let at = text.indexOf("MSH|"); at !== -1; at = text.indexOf("MSH|", at + 1)) out.push(at);
  return out;
}

const BATCH =
  "FHS|^~\\&|LAB\r" +
  "BHS|^~\\&|LAB\r" +
  adt("A1") +
  oru("R2") +
  "BTS|2\r" +
  "BHS|^~\\&|LAB\r" +
  adt("A3").replaceAll("\r", "\r\n") +
  "\r\n" +
  adt("A4").replaceAll("\r", "\n") +
  "BTS|2\r" +
  "FTS|2\r";

describe("readMessages: a batch", () => {
  it("yields every message splitBatch finds, each the message parseHL7 gives for its bytes", async () => {
    const items = await drain(readMessages(BATCH));
    const reference = splitBatch(BATCH).messages;
    expect(items).toHaveLength(4);
    expect(items.map(itemView)).toEqual(
      reference.map((entry) =>
        entry.ok ? { ok: true, message: view(entry.message) } : { ok: false },
      ),
    );
    expect(items.map((item) => item.position)).toEqual(reference.map((entry) => entry.position));
    expect(items.map((item) => item.index)).toEqual([0, 1, 2, 3]);
    const bytes = Buffer.from(BATCH, "utf8");
    for (const item of items) {
      // Every message is exactly the bytes at its position, so parsing them gives the same.
      const slice = bytes.subarray(item.byteOffset, item.byteOffset + item.byteLength);
      expect(itemView(item)).toEqual(parsed(slice.toString("utf8")));
      expect(slice.subarray(0, 4).toString()).toBe("MSH|");
      expect(item.streamWarnings).toEqual([]);
    }
  });

  it("reads bare concatenated messages without an envelope", async () => {
    const text = adt("B1") + adt("B2") + "\r\r" + oru("B3");
    const items = await drain(readMessages(text));
    expect(items.map((item) => (item.ok ? item.message.meta.controlId : ""))).toEqual([
      "B1",
      "B2",
      "B3",
    ]);
    expect(items.map((item) => item.byteOffset)).toEqual(
      starts(text).map((at) => Buffer.byteLength(text.slice(0, at))),
    );
  });

  it("yields lazy messages unless told otherwise, and passes options to parseHL7", async () => {
    const [lazy] = await drain(readMessages(adt("L1")));
    const [eager] = await drain(readMessages(adt("L1"), { lazy: false }));
    expect(lazy?.ok && eager?.ok).toBe(true);
    if (lazy?.ok !== true || eager?.ok !== true) return;
    expect(view(lazy.message)).toEqual(view(eager.message));
    const vendor = defineProfile({
      name: "vendor",
      customSegments: { ZDP: { fields: { code: 3 } } },
    });
    const [typed] = await drain(readMessages(`${adt("P1")}ZDP|1||D42\r`, vendor));
    expect(typed?.ok).toBe(true);
    if (typed?.ok === true) {
      expect(typed.message.part("ZDP")?.get("code")?.value).toBe("D42");
      expect(typed.message.profile?.name).toBe("vendor");
    }
    const [viaOptions] = await drain(readMessages(`${adt("P2")}ZDP|1||D43\r`, { profile: vendor }));
    expect(viaOptions?.ok === true && viaOptions.message.part("ZDP")?.get("code")?.value).toBe(
      "D43",
    );
  });

  it("gives the same items wherever a string is cut, one character at a time included", async () => {
    const whole = (await drain(readMessages(BATCH))).map(itemView);
    for (let cut = 0; cut <= BATCH.length; cut++) {
      const items = await drain(readMessages(cutAt(BATCH, [cut])));
      expect(items.map(itemView)).toEqual(whole);
    }
    expect((await drain(readMessages(BATCH.split("")))).map(itemView)).toEqual(whole);
  });

  it("gives the same items wherever bytes are cut, inside a multi-byte character included", async () => {
    const bytes = Buffer.from(BATCH, "utf8");
    const whole = await drain(readMessages(bytes));
    const reference = whole.map(itemView);
    // Bytes are parsed as parseHL7 parses a Buffer: in the charset MSH-18 declares.
    for (const item of whole) {
      const slice = bytes.subarray(item.byteOffset, item.byteOffset + item.byteLength);
      expect(itemView(item)).toEqual(parsed(Buffer.from(slice)));
    }
    for (let cut = 0; cut <= bytes.length; cut++) {
      const items = await drain(readMessages(cutBytes(bytes, [cut])));
      expect(items.map(itemView)).toEqual(reference);
      expect(items.map((item) => item.byteOffset)).toEqual(whole.map((item) => item.byteOffset));
    }
    const perByte = Array.from(bytes, (b) => Uint8Array.of(b));
    expect((await drain(readMessages(perByte))).map(itemView)).toEqual(reference);
  });

  it("reads from a Node Readable, a web ReadableStream, an async iterable and an array", async () => {
    const reference = (await drain(readMessages(BATCH))).map(itemView);
    const bytes = Buffer.from(BATCH, "utf8");
    const chunks = cutBytes(bytes, [7, 300, 301, 640]);
    const sources: Hl7ReadSource[] = [
      Readable.from(chunks),
      Readable.from(cutAt(BATCH, [5, 90])),
      webStream(chunks).stream,
      webStream(cutAt(BATCH, [100])).stream,
      counted(chunks).source,
      chunks,
      new Uint8Array(bytes),
    ];
    for (const source of sources) {
      expect((await drain(readMessages(source))).map(itemView)).toEqual(reference);
    }
    const text = Readable.from([bytes]);
    text.setEncoding("utf8");
    expect((await drain(readMessages(text))).map(itemView)).toEqual(reference);
  });

  it("skips a byte order mark and counts its bytes", async () => {
    for (const source of [`\ufeff${adt("O1")}`, Buffer.from(`\ufeff${adt("O1")}`, "utf8")]) {
      const [item] = await drain(readMessages(source));
      expect(item?.ok === true && item.message.meta.controlId).toBe("O1");
      expect(item?.byteOffset).toBe(3);
    }
    const perByte = Array.from(Buffer.from(`\ufeff${adt("O2")}`, "utf8"), (b) => Uint8Array.of(b));
    const [split] = await drain(readMessages(perByte));
    expect(split?.ok === true && split.message.meta.controlId).toBe("O2");
    expect(split?.byteOffset).toBe(3);
    // Two bytes that only begin one, and the text that is nothing but one.
    const [short] = await drain(readMessages([Uint8Array.of(0xef, 0xbb)]));
    expect(short?.ok).toBe(false);
    expect(await drain(readMessages("\ufeff"))).toEqual([]);
    expect(await drain(readMessages(["", "", adt("O3")]))).toHaveLength(1);
    // An empty first chunk does not hide a byte order mark in the next.
    const [late] = await drain(readMessages(["", `\ufeff${adt("O4")}`]));
    expect(late?.ok === true && late.message.meta.controlId).toBe("O4");
    expect(late?.byteOffset).toBe(3);
  });

  it("yields nothing for an empty or blank source", async () => {
    expect(await drain(readMessages(""))).toEqual([]);
    expect(await drain(readMessages(new Uint8Array(0)))).toEqual([]);
    expect(await drain(readMessages([" \r\n", "\t\r"]))).toEqual([]);
    expect(await drain(readMessages([]))).toEqual([]);
  });
});

describe("readMessages: a message that fails", () => {
  const text = `stray line\r${adt("E1")}MSH|^\r${adt("E2")}`;

  it("is an item with its byte position, and reading goes on", async () => {
    const items = await drain(readMessages(text));
    expect(items.map((item) => (item.ok ? item.message.meta.controlId : item.error.code))).toEqual([
      "NO_MSH_SEGMENT",
      "E1",
      "MSH_TOO_SHORT",
      "E2",
    ]);
    const bad = items[2];
    expect(bad?.ok).toBe(false);
    if (bad === undefined || bad.ok) return;
    expect(bad.byteOffset).toBe(text.indexOf("MSH|^\r"));
    expect(bad.byteLength).toBe("MSH|^\r".length);
    expect(bad.raw).toBe("MSH|^\r");
    expect(bad.position).toEqual({ segmentIndex: 5 });
    const stray = items[0];
    expect(stray !== undefined && !stray.ok && stray.raw).toBe("stray line\r");
  });

  it("carries its bytes as bytes from a byte source", async () => {
    const items = await drain(readMessages(Buffer.from(text, "latin1")));
    const bad = items[2];
    expect(bad !== undefined && !bad.ok && bad.raw).toEqual(Buffer.from("MSH|^\r", "latin1"));
  });

  it("stops reading in strict mode, at the first failed message, and releases the source", async () => {
    const chunks = cutAt(text, [20, 120, 150, 200]);
    const { stream, cancelled } = webStream(chunks);
    const items = await drain(readMessages(stream, { strict: true }));
    expect(items).toHaveLength(1);
    expect(items[0]?.ok).toBe(false);
    expect(cancelled()).toBe(true);

    // A warning fails its message in strict mode, as parseHL7 throws it.
    const warned = `${adt("S1")}${adt("S2").replace("PV1|", "ZZZ|")}${adt("S3")}`;
    const strictItems = await drain(readMessages(warned, { strict: true }));
    expect(strictItems.map((item) => item.ok)).toEqual([true, false]);
    const failed = strictItems[1];
    expect(failed !== undefined && !failed.ok && failed.error.code).toBe(
      WARNING_CODES.UNKNOWN_SEGMENT,
    );
    const lenient = await drain(readMessages(warned));
    expect(lenient.map((item) => item.ok)).toEqual([true, true, true]);

    // The last item fails: strict mode stops there too.
    const lastFails = await drain(readMessages(`${adt("S4")}MSH|^`, { strict: true }));
    expect(lastFails.map((item) => item.ok)).toEqual([true, false]);
    const profileOnly = await drain(readMessages(warned, defineProfile({ name: "p" })));
    expect(profileOnly).toHaveLength(3);
  });

  it("lets an error that is not a parse error through", async () => {
    const hostile = new Proxy(
      { name: "hostile" },
      {
        get(target, key) {
          if (key === "customSegments") throw new RangeError("profile read failed");
          return Reflect.get(target, key) as unknown;
        },
      },
    ) as Profile;
    await expect(drain(readMessages(adt("H1"), hostile))).rejects.toThrow(RangeError);
  });
});

describe("readMessages: the end of the source", () => {
  it("flags a last message whose last segment has no terminator", async () => {
    const items = await drain(readMessages(adt("T1") + adt("T2").trimEnd()));
    expect(items[0]?.streamWarnings).toEqual([]);
    expect(items[1]?.streamWarnings.map((w) => w.code)).toEqual([
      WARNING_CODES.UNTERMINATED_STREAM_MESSAGE,
    ]);
    expect(Object.isFrozen(items[1]?.streamWarnings)).toBe(true);
  });

  it("does not flag one that ends in a terminator, blank lines or an envelope", async () => {
    for (const text of [adt("T3"), `${adt("T3")}\r\r`, `${adt("T3")}BTS|1`, `${adt("T3")}  `]) {
      const items = await drain(readMessages(text));
      expect(items).toHaveLength(1);
      expect(items[0]?.streamWarnings).toEqual([]);
    }
  });
});

describe("readMessages: backpressure", () => {
  it("pulls a chunk only when the next item needs it", async () => {
    const chunks = Array.from({ length: 50 }, (_v, i) => adt(`Q${String(i)}`));
    const { stream, pulled, cancelled } = webStream(chunks);
    const iterator = readMessages(stream)[Symbol.asyncIterator]();
    const first = await iterator.next();
    expect(first.done).toBe(false);
    // The first message ends when the second MSH arrives: two chunks, never the whole source.
    expect(pulled()).toBeLessThanOrEqual(3);
    await iterator.return();
    expect(cancelled()).toBe(true);
    expect(pulled()).toBeLessThanOrEqual(3);
  });

  it("holds about one message at a time from a long async source", async () => {
    const count = 2000;
    let produced = 0;
    async function* source(): AsyncGenerator<string> {
      for (let i = 0; i < count; i++) {
        await Promise.resolve();
        produced += 1;
        yield adt(`M${String(i)}`);
      }
    }
    let received = 0;
    let readAhead = 0;
    for await (const item of readMessages(source())) {
      expect(item.ok).toBe(true);
      received += 1;
      readAhead = Math.max(readAhead, produced - received);
    }
    expect(received).toBe(count);
    expect(readAhead).toBeLessThanOrEqual(1);
  });

  it("destroys a Node Readable it stops reading", async () => {
    const readable = Readable.from([adt("D1"), adt("D2"), adt("D3")]);
    for await (const item of readMessages(readable)) {
      expect(item.ok).toBe(true);
      break;
    }
    expect(readable.destroyed).toBe(true);
  });
});

describe("readMessages: MLLP frames", () => {
  const messages = [adt("F1"), oru("F2"), adt("F3").trimEnd(), "MSH|^\r"];
  const framed = Buffer.concat(messages.map((m) => encodeFrame(Buffer.from(m, "utf8"))));

  it("reads @cosyte/mllp's framed messages, each the message parseHL7 gives for its frame", async () => {
    const reference = messages.map((m) => parsed(encodeFrame(Buffer.from(m, "utf8"))));
    expect((await drain(readMessages(framed))).map(itemView)).toEqual(reference);
    for (let cut = 0; cut <= framed.length; cut += 7) {
      const items = await drain(readMessages(cutBytes(framed, [cut, cut + 3])));
      expect(items.map(itemView)).toEqual(reference);
    }
    const first = (await drain(readMessages(framed)))[0];
    expect(first?.ok === true && first.message.warnings.map((w) => w.code)).toEqual([
      WARNING_CODES.MLLP_FRAMING_STRIPPED,
    ]);
    expect(first?.byteOffset).toBe(0);
    expect(first?.byteLength).toBe(encodeFrame(Buffer.from(adt("F1"))).length);
  });

  it("yields a frame as soon as its end arrives, before the next chunk is pulled", async () => {
    const frames = messages.slice(0, 2).map((m) => encodeFrame(Buffer.from(m, "utf8")));
    const { stream, pulled } = webStream(frames);
    const iterator = readMessages(stream)[Symbol.asyncIterator]();
    const first = await iterator.next();
    expect(first.done === false && first.value.ok).toBe(true);
    expect(pulled()).toBe(1);
    await iterator.return();
  });

  it("skips a line feed after a frame's end, and reports a stray end byte as parseHL7 does", async () => {
    const text = `\u000b${adt("G1")}\u001c\r\n\u000b${adt("G2")}\u001c\r\u001c\r`;
    const items = await drain(readMessages(text));
    expect(items.map((item) => (item.ok ? item.message.meta.controlId : item.error.code))).toEqual([
      "G1",
      "G2",
      "EMPTY_INPUT",
    ]);
    for (let cut = 0; cut <= text.length; cut++) {
      expect((await drain(readMessages(cutAt(text, [cut])))).map(itemView)).toEqual(
        items.map(itemView),
      );
    }
  });
});

describe("readMessages and readSegments: the source", () => {
  it("refuses a source that is not text, bytes, a stream or an iterable", async () => {
    const readers: ((source: Hl7ReadSource) => AsyncIterable<unknown>)[] = [
      readMessages,
      readSegments,
    ];
    for (const read of readers) {
      const bads: unknown[] = [42, null, undefined, {}];
      for (const bad of bads) {
        await expect(drain(read(bad as Hl7ReadSource))).rejects.toThrow(TypeError);
      }
      await expect(drain(read([42] as unknown as Hl7ReadSource))).rejects.toThrow(
        /each chunk must be a string or a Uint8Array; received number/u,
      );
      await expect(drain(read([null] as unknown as Hl7ReadSource))).rejects.toThrow(
        /received null/u,
      );
      await expect(drain(read(["MSH", Uint8Array.of(0x7c)]))).rejects.toThrow(
        /all strings or all bytes/u,
      );
    }
  });

  it("releases a web stream that fails", async () => {
    const stream = new ReadableStream<string>({
      pull(controller) {
        controller.error(new Error("source failed"));
      },
    });
    await expect(drain(readMessages(stream))).rejects.toThrow("source failed");
    expect(stream.locked).toBe(false);
  });
});

/** What a segment gives a reader. */
function segmentView(item: ReadSegmentItem): unknown {
  return {
    index: item.index,
    type: item.segment.type,
    raw: item.segment.raw,
    altered: item.segment.fields.map((f) => fieldArrivedAltered(f)),
  };
}

/** What parseHL7 gives, as `readSegments` items would show it: segments and their warnings. */
function segmentsOf(input: string | Buffer, options?: ParseOptions): unknown {
  const message = options === undefined ? parseHL7(input) : parseHL7(input, options);
  return message.allSegments().map((segment, index) => ({
    index,
    type: segment.type,
    raw: segment.raw,
    altered: segment.fields.map((f) => fieldArrivedAltered(f)),
  }));
}

/** Every warning the items carry, in parseHL7's order: those before any segment, by segment, then the rest. */
function sortedWarnings(warnings: readonly { code: string; message: string }[]): string[] {
  return warnings.map((w) => JSON.stringify(w)).sort();
}

/** Read `source` and check it against `parseHL7(whole)`. */
async function expectSegmentsMatch(
  source: Hl7ReadSource,
  whole: string | Buffer,
  options?: ParseOptions,
): Promise<ReadSegmentItem[]> {
  const items = await drain(
    options === undefined ? readSegments(source) : readSegments(source, options),
  );
  expect(items.map(segmentView)).toEqual(segmentsOf(whole, options));
  const message = options === undefined ? parseHL7(whole) : parseHL7(whole, options);
  expect(sortedWarnings(items.flatMap((item) => item.warnings))).toEqual(
    sortedWarnings(message.warnings),
  );
  return items;
}

const LARGE =
  "MSH|^~\\&|LAB|SENDFAC|EHR|RECVFAC|20260101120000||ORU^R01|R9|P|2.5||||||UNICODE UTF-8\r\n" +
  "PID|1||FAKE9^^^HOSP^MR||Doe^Jane||19750615|M\r\nNTE|1||Ren\u00e9e^Zo\u00eb\u{1f600}\r\n" +
  "OBR|1||ACC9|CBC^Count^LN\r\n" +
  "OBX|1|TX|NOTE^Note^LN||a\\.br\\b \\Z\\ \\T\\|| x \r" +
  "obx|2|NM|GLU^Glucose^LN||95|mg/dL\n" +
  "\r" +
  "ZZZ|1\r" +
  "OBX|3|NM|GLU^Glucose^LN||96|mg/dL|||||F";

describe("readSegments: one message", () => {
  it("yields each segment parseHL7 builds, with the warnings it reports about it", async () => {
    const items = await expectSegmentsMatch(LARGE, LARGE);
    expect(items.map((item) => item.warnings.map((w) => w.code))).toEqual([
      [],
      [],
      [],
      [],
      [WARNING_CODES.UNKNOWN_ESCAPE_SEQUENCE, WARNING_CODES.FIELD_WHITESPACE_TRIMMED].sort(
        (a, b) =>
          parseHL7(LARGE)
            .warnings.map((w) => w.code)
            .indexOf(a) -
          parseHL7(LARGE)
            .warnings.map((w) => w.code)
            .indexOf(b),
      ),
      [WARNING_CODES.SEGMENT_CASE],
      [WARNING_CODES.UNKNOWN_SEGMENT],
      [WARNING_CODES.UNKNOWN_SEGMENT],
      [],
    ]);
    for (const item of items) expect(Object.isFrozen(item)).toBe(true);
  });

  it("gives the same items wherever a string or its bytes are cut", async () => {
    for (let cut = 0; cut <= LARGE.length; cut++) {
      await expectSegmentsMatch(cutAt(LARGE, [cut]), LARGE);
    }
    await expectSegmentsMatch(LARGE.split(""), LARGE);
    const bytes = Buffer.from(LARGE, "utf8");
    for (let cut = 0; cut <= bytes.length; cut++) {
      await expectSegmentsMatch(cutBytes(bytes, [cut]), bytes);
    }
    await expectSegmentsMatch(
      Array.from(bytes, (b) => Uint8Array.of(b)),
      bytes,
    );
  });

  it("reads every kind of source", async () => {
    const bytes = Buffer.from(LARGE, "utf8");
    const chunks = cutBytes(bytes, [10, 100, 101, 200]);
    for (const source of [
      bytes,
      Readable.from(chunks),
      webStream(chunks).stream,
      counted(chunks).source,
    ] as Hl7ReadSource[]) {
      await expectSegmentsMatch(source, bytes);
    }
  });

  it("reports the message's missing segments with the last segment", async () => {
    const text = "MSH|^~\\&|LAB|F|EHR|G|20260101||ORU^R01|M1|P|2.5\rPID|1||X^^^H^MR\r";
    const items = await expectSegmentsMatch(text, text);
    expect(items[0]?.warnings).toEqual([]);
    expect(items[1]?.warnings.length).toBeGreaterThan(0);
    for (const w of items[1]?.warnings ?? []) expect(w.position.segmentIndex).toBe(0);
  });

  it("decodes bytes in the charset MSH-18 or options.charset names", async () => {
    const latin1 = Buffer.from(
      "MSH|^~\\&|A|F|B|G|20260101||ADT^A01|C1|P|2.5||||||8859/1\rPID|1||X^^^H^MR||Doe^Jane\rNTE|1||Ren\u00e9e\r",
      "latin1",
    );
    await expectSegmentsMatch(cutBytes(latin1, [70]), latin1);
    const ascii = Buffer.from(latin1.toString("latin1").replace("Ren\u00e9e", "Renee"), "latin1");
    const items = await expectSegmentsMatch(ascii, ascii, { charset: "UNICODE UTF-8" });
    expect(items[0]?.warnings.map((w) => w.code)).toEqual([WARNING_CODES.ENCODING_MISMATCH]);
    const unknown = Buffer.from(
      "MSH|^~\\&|A|F|B|G|20260101||ADT^A01|C2|P|2.5||||||NOT A SET\rPID|1\r",
      "latin1",
    );
    const flagged = await expectSegmentsMatch(unknown, unknown);
    expect(flagged[0]?.warnings.map((w) => w.code)).toEqual([WARNING_CODES.UNKNOWN_CHARSET]);
    const wide = Buffer.from(
      "MSH|^~\\&|A|F|B|G|20260101||ADT^A01|C3|P|2.5||||||UNICODE UTF-16\rPID|1\r",
      "latin1",
    );
    await expectSegmentsMatch(wide, wide);
    const oneLine = Buffer.from("MSH|^~\\&|A|F|B|G|20260101||ADT^A01|C4|P|2.5", "latin1");
    await expectSegmentsMatch(cutBytes(oneLine, [5]), oneLine);
  });

  it("keeps the bytes verbatim, as parseHL7 does, on a runtime without the set's decoder", async () => {
    const Original = globalThis.TextDecoder;
    class Partial extends Original {
      public constructor(label?: string, options?: { fatal?: boolean; ignoreBOM?: boolean }) {
        if (label === "iso-8859-2") throw new RangeError("no such decoder");
        super(label, options);
      }
    }
    vi.stubGlobal("TextDecoder", Partial);
    try {
      const text = Buffer.from(
        "MSH|^~\\&|A|F|B|G|20260101||ADT^A01|N1|P|2.5||||||8859/2\rPID|1\r",
        "latin1",
      );
      const items = await expectSegmentsMatch(text, text);
      expect(items[0]?.warnings.map((w) => w.code)).toEqual([WARNING_CODES.UNSUPPORTED_CHARSET]);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("throws UNSUPPORTED_CHARSET at a byte that is not valid in the declared set", async () => {
    const bad = Buffer.concat([
      Buffer.from(
        "MSH|^~\\&|A|F|B|G|20260101||ADT^A01|U1|P|2.5||||||UNICODE UTF-8\rPID|1||",
        "latin1",
      ),
      Uint8Array.of(0xff),
      Buffer.from("\rPV1|1\r", "latin1"),
    ]);
    // parseHL7 reads the whole message verbatim instead, which a stream cannot.
    expect(parseHL7(bad).warnings.map((w) => w.code)).toContain(WARNING_CODES.UNSUPPORTED_CHARSET);
    const error = await drain(readSegments(bad)).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Hl7ParseError);
    expect((error as Hl7ParseError).code).toBe(WARNING_CODES.UNSUPPORTED_CHARSET);
  });

  it("applies the profile: claimed segments, named fields and date formats", async () => {
    const vendor = defineProfile({
      name: "vendor",
      customSegments: { ZDP: { fields: { code: 3 } } },
      segmentOverrides: { PID: { fields: { mrn: 3 } } },
      dateFormats: ["YYYYMMDD"],
    });
    const text = `${adt("V1")}ZDP|1||D9\r`;
    const items = await expectSegmentsMatch(text, text, { profile: vendor });
    expect(items.find((i) => i.segment.type === "ZDP")?.segment.get("code")?.value).toBe("D9");
    expect(items.find((i) => i.segment.type === "PID")?.segment.get("mrn")?.value).toBe("FAKEV1");
    expect(items.every((i) => i.warnings.length === 0)).toBe(true);
    await expectSegmentsMatch(text, text, { trimFields: false });
  });

  it("yields a segment before the rest of the message has been pulled", async () => {
    const lines = Array.from(
      { length: 200 },
      (_v, i) => `OBX|${String(i + 1)}|NM|G^G^LN||${String(i)}\r`,
    );
    const chunks = [adt("Y1"), ...lines];
    const { stream, pulled, cancelled } = webStream(chunks);
    const iterator = readSegments(stream)[Symbol.asyncIterator]();
    const first = await iterator.next();
    expect(first.done === false && first.value.segment.type).toBe("MSH");
    expect(pulled()).toBeLessThanOrEqual(2);
    await iterator.return();
    expect(cancelled()).toBe(true);
  });
});

describe("readSegments: what parseHL7 refuses", () => {
  const refused = [
    "",
    "\ufeff",
    "\u000b\u001c\r",
    "\u001c\r",
    "\r",
    "\r\n",
    "\u000b\r",
    "\rMSH|^~\\&|A",
    "PID|1\r",
    "MSH|^\r",
    "MSH \u00a0^~\\&|A\r",
    "MSH|^~\\&",
  ];

  it("throws the error parseHL7 throws, before any segment", async () => {
    for (const text of refused) {
      const expected = (() => {
        try {
          parseHL7(text);
          return undefined;
        } catch (error) {
          return errorView(error);
        }
      })();
      const actual = await drain(readSegments(text)).then(
        () => undefined,
        (error: unknown) => errorView(error),
      );
      expect(actual, JSON.stringify(text)).toEqual(expected);
      const bytes = Buffer.from(text, "utf8");
      const fromBytes = await drain(readSegments(bytes)).then(
        () => undefined,
        (error: unknown) => errorView(error),
      );
      expect(fromBytes, JSON.stringify(text)).toEqual(parsedError(bytes));
    }
    await expect(drain(readSegments(new Uint8Array(0)))).rejects.toThrow("Input is empty.");
    await expect(drain(readSegments([]))).rejects.toThrow("Input is empty.");
  });

  it("throws the first warning in strict mode, as parseHL7 throws it", async () => {
    for (const options of [{ charset: "NOT A SET" }, { charset: "NOT A SET", strict: true }]) {
      const bytes = Buffer.from("\r", "latin1");
      const actual = await drain(readSegments(bytes, options)).then(
        () => undefined,
        (error: unknown) => errorView(error),
      );
      expect(actual).toEqual(parsedError(bytes, options));
    }
    for (const text of [
      `${adt("K1")}ZZZ|1\r`,
      "MSH|^~\\&|A|F|B|G|1||ADT^A01|K2|P|2.5\rpid|1\r",
      "MSH|^~\\&|A\rPID|1|| x \r",
      "\u000bMSH|^~\\&|A|F|B|G|1||ADT^A01|K3|P|2.5\rPID|1\r\u001c\r",
      "MSH|^~\\&|A|F|B|G|1||ORU^R01|K4|P|2.5\rPID|1\r",
      "MSH|^~\\&|A|F|B|G|1||ADT^A01|K5|P|2.5||||||NOT A SET\r",
      "\u000b\r",
    ]) {
      for (const source of [text, Buffer.from(text, "latin1")]) {
        const expected = parsedError(source, { strict: true });
        const actual = await drain(readSegments(source, { strict: true })).then(
          () => undefined,
          (error: unknown) => errorView(error),
        );
        expect(actual, JSON.stringify(text)).toEqual(expected);
      }
    }
  });
});

/** The error parseHL7 throws for `input`, as a comparable view, or undefined. */
function parsedError(input: string | Buffer, options?: ParseOptions): unknown {
  try {
    if (options === undefined) parseHL7(input);
    else parseHL7(input, options);
    return undefined;
  } catch (error) {
    return errorView(error);
  }
}

describe("readSegments: MLLP framing", () => {
  const body = adt("W1");

  it("reads a framed message as parseHL7 does, and reports the framing with MSH", async () => {
    for (const framed of [
      `\u000b${body}\u001c\r`,
      `\u000b${body.trimEnd()}\u001c\r`,
      `\u000b${body}\u001c`,
    ]) {
      for (let cut = 0; cut <= framed.length; cut += 5) {
        const items = await expectSegmentsMatch(cutAt(framed, [cut]), framed);
        expect(items[0]?.warnings.map((w) => w.code)).toEqual([
          WARNING_CODES.MLLP_FRAMING_STRIPPED,
        ]);
      }
      await expectSegmentsMatch(framed, framed, { stripMllpFraming: false });
    }
  });

  it("reports framing first seen after MSH with the last segment", async () => {
    const late = `${body}\u001c\r`;
    const items = await expectSegmentsMatch(cutAt(late, [late.length - 2]), late);
    expect(items[0]?.warnings).toEqual([]);
    expect(items.at(-1)?.warnings.map((w) => w.code)).toEqual([
      WARNING_CODES.MLLP_FRAMING_STRIPPED,
    ]);
  });

  it("marks the fields an interior framing byte was removed from", async () => {
    for (const text of [
      `\u000b${body.replace("FAKEW1", "FAKE\u000bW1")}\u001c\r`,
      `\u000b${body.replace("WARD", "WA\u001cRD")}\u001c\u001c`,
      `\u000b${body}\u001c\r\r`,
      `\u000b${body}\u001c\rEVN|A01\r`,
      `${body.replace("Doe", "D\u001coe")}`,
      // An FS between the CR and the LF that end MSH: only that one break.
      `${body.slice(0, body.indexOf("\r"))}\r\u001c\n${body.slice(body.indexOf("\r") + 1)}`,
      `\u000bMSH|^~\\&|A\u001c|F\rPID|1\u000b|2\r\n\u001c\r`,
      `\u000bMSH|^~\\&|A\u001c|F\u000b|G\rPID|1\u000b|2\u001c\u001c\r`,
      "MSH|^~\\&|A\rPID|1| x | y |\r",
      "\u000bMSH|^~\\&|A\rPID|1\r",
    ]) {
      for (let cut = 0; cut <= text.length; cut += 3) {
        await expectSegmentsMatch(cutAt(text, [cut]), text);
      }
    }
  });
});
