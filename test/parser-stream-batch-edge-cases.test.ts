/**
 * Edge cases of the parser, the batch splitter and the stream reader the main
 * suites do not reach: date formats that match part of a value and then fail,
 * offsets out of range, a stray framing byte after the last segment, a caller's
 * `onWarning` that throws, and stream chunks that are not text or bytes.
 *
 * Every case asserts what a consumer reads back. All values are synthetic.
 */

import { describe, expect, it } from "vitest";

import {
  Hl7ParseError,
  fieldWhitespaceTrimmed,
  parseDtm,
  parseHL7,
  parseStream,
  readMessages,
  splitBatch,
  type Hl7StreamSource,
  type StreamMessageEntry,
} from "../src/index.js";

const MSH_A = "MSH|^~\\&|A|B|C|D|20260101||ADT^A01|MSGA|P|2.5";
const MSH_B = "MSH|^~\\&|A|B|C|D|20260101||ADT^A01|MSGB|P|2.5";

async function collect(source: Hl7StreamSource): Promise<StreamMessageEntry[]> {
  const out: StreamMessageEntry[] = [];
  for await (const entry of parseStream(source)) out.push(entry);
  return out;
}

/** PID-7 of a one-PID message read through the caller's own date format. */
const dobThrough = (format: string, value: string) =>
  parseHL7(`${MSH_A}\rPID|1||MRN1||Doe^Jane||${value}`, { dateFormats: [format] })
    .segments("PID")[0]
    ?.field(7)
    .asTs();

describe("caller date formats that match part of a value", () => {
  it("a fraction that fits but leaves the rest unmatched retries narrower, then gives up", () => {
    const format = "YYYYMMDDHHmmss.SSSS[Z]";
    expect(dobThrough(format, "20260101120000.1234Z")?.valid).toBe(true);
    expect(dobThrough(format, "20260101120000.12345Z")?.valid).toBe(false);
  });

  it("a month name that fits but leaves the rest unmatched is not a match", () => {
    const format = "MMM D YYYY";
    expect(dobThrough(format, "Jan 5 2026")?.month).toBe(1);
    expect(dobThrough(format, "Jan 5 20x6")?.valid).toBe(false);
  });

  it("a meridiem needs two letters and nothing after it", () => {
    const format = "YYYY-MM-DD h:mm A";
    expect(dobThrough(format, "2026-01-05 1:05 PM")?.hour).toBe(13);
    expect(dobThrough(format, "2026-01-05 1:05 7x")?.valid).toBe(false);
    expect(dobThrough(format, "2026-01-05 1:05 PMx")?.valid).toBe(false);
  });
});

describe("parseDtm", () => {
  it("refuses an offset past 24 hours or 59 minutes", () => {
    expect(parseDtm("202601011200+2500").valid).toBe(false);
    expect(parseDtm("202601011200+0160").valid).toBe(false);
    expect(parseDtm("202601011200+0130").offsetMinutes).toBe(90);
  });
});

describe("fieldWhitespaceTrimmed", () => {
  it("summarizes zero trimmed characters as 0", () => {
    expect(fieldWhitespaceTrimmed({ segmentIndex: 1, fieldIndex: 5 }, 0, 0).message).toBe(
      "Field had 0 whitespace character(s) trimmed.",
    );
  });
});

describe("a stray framing byte after the last segment", () => {
  const OBX = `${MSH_A}\rOBX|1|NM|X||5||||||F`;

  it("alters no field, so OBX-11 still classifies", () => {
    const msg = parseHL7(`${OBX}\r\u000B`);
    expect(msg.warnings.map((w) => w.code)).toContain("MLLP_FRAMING_STRIPPED");
    expect(msg.observations()[0]?.resultStatus.classification).toBe("final");
  });

  it("while one inside OBX-11 leaves it undetermined", () => {
    const msg = parseHL7(OBX.replace("||F", "||\u000BF"));
    expect(msg.observations()[0]?.resultStatus.classification).toBe("undetermined");
  });
});

describe("splitBatch", () => {
  const batch = (trailerCount: string): string =>
    ["BHS|^~\\&", MSH_A, "PID|1", `BTS|${trailerCount}`, ""].join("\r");

  it("ignores a declared count too large to be an exact integer", () => {
    expect(splitBatch(batch("99999999999999999999")).warnings).toEqual([]);
    expect(splitBatch(batch("5")).warnings.map((w) => w.code)).toEqual(["BATCH_COUNT_MISMATCH"]);
  });

  it("rethrows an error that is not a parse error instead of reporting a failed message", () => {
    // `dateFormats` must be an array; a JavaScript caller can pass anything.
    expect(() => splitBatch(`${MSH_A}\rPID|1`, { dateFormats: 5 as never })).toThrow(TypeError);
  });
});

describe("parseStream", () => {
  it("refuses a chunk that is not text or bytes, naming its type", async () => {
    await expect(collect([42 as never])).rejects.toThrow(/received number\.$/u);
    await expect(collect([null as never])).rejects.toThrow(/received null\.$/u);
  });

  it("refuses a source that is null or not iterable", async () => {
    await expect(collect(null as never)).rejects.toThrow(TypeError);
    const notIterable: object = {};
    await expect(collect(notIterable as never)).rejects.toThrow(
      /must be an async-iterable or iterable of chunks \(e\.g\. a Node Readable\)/u,
    );
  });

  it("rethrows an error that is not a parse error instead of yielding a failed entry", async () => {
    const run = async (): Promise<void> => {
      // `dateFormats` must be an array; a JavaScript caller can pass anything.
      for await (const _ of parseStream([`${MSH_A}\rPID|1\r`], { dateFormats: 5 as never }));
    };
    await expect(run()).rejects.toThrow(TypeError);
  });

  it("splits on an LF that comes before the next CR", async () => {
    const [entry] = await collect([`${MSH_A}\nPID|1\rPV1|1\r`]);
    expect(entry?.ok && entry.message.allSegments().map((s) => s.type)).toEqual([
      "MSH",
      "PID",
      "PV1",
    ]);
  });

  it("drops blank lines that trail a message", async () => {
    const entries = await collect([`${MSH_A}\rPID|1\r\r\r${MSH_B}\rPID|2\r`]);
    expect(entries.map((e) => e.raw)).toEqual([`${MSH_A}\rPID|1`, `${MSH_B}\rPID|2`]);
  });

  it("skips a blank line before the first MSH and keeps stray content as a failure", async () => {
    const entries = await collect([`\rPID|0\r${MSH_A}\rPID|1\r`]);
    expect(entries).toHaveLength(2);
    const [stray, real] = entries;
    expect(stray?.ok).toBe(false);
    expect(stray?.ok === false && stray.error).toBeInstanceOf(Hl7ParseError);
    expect(stray?.position.segmentIndex).toBe(1);
    expect(real?.ok).toBe(true);
    expect(real?.position.segmentIndex).toBe(2);
  });

  it("strips a leading BOM from text, from bytes, and from bytes split across chunks", async () => {
    const body = `${MSH_A}\rPID|1\r`;
    const bytes = Buffer.from(body, "latin1");
    const bom = Buffer.from([0xef, 0xbb, 0xbf]);
    for (const source of [
      [`\uFEFF${body}`],
      [Buffer.concat([bom, bytes])],
      [bom.subarray(0, 1), bom.subarray(1, 2), Buffer.concat([bom.subarray(2), bytes])],
    ]) {
      const [entry] = await collect(source);
      expect(entry?.ok).toBe(true);
      expect(entry?.raw).toBe(`${MSH_A}\rPID|1`);
    }
  });

  it("skips a line of only a byte order mark or other whitespace from bytes as from text", async () => {
    for (const blank of ["\ufeff", "\u00a0", " \u3000\t"]) {
      const text = `BHS|^~\\&|A\r${blank}\r${MSH_A}\rPID|1\rBTS|1\r${blank}\r${MSH_B}\r${blank}`;
      const bytes = Buffer.from(text, "utf8");
      const shape = (entries: readonly { ok: boolean; position: unknown }[]): unknown =>
        entries.map((entry) => [entry.ok, entry.position]);
      const fromText = await collect([text]);
      const fromBytes = await collect([bytes]);
      expect(shape(fromText)).toEqual([
        [true, { segmentIndex: 2 }],
        [true, { segmentIndex: 6 }],
      ]);
      expect(shape(fromBytes)).toEqual(shape(fromText));
      expect(fromBytes.map((entry) => entry.streamWarnings)).toEqual([[], []]);
      expect(shape(splitBatch(bytes).messages)).toEqual(shape(splitBatch(text).messages));
      expect(splitBatch(bytes).messages).toHaveLength(2);
    }
  });

  it("keeps, in text, the three letters a byte order mark reads as one byte to one character", async () => {
    const letters = "\u00ef\u00bb\u00bf";
    const text = `${MSH_A}\rBTS|1\r${letters}\r${MSH_B}\r${letters}`;
    const entries = await collect([text]);
    expect(entries.map((entry) => entry.ok)).toEqual([true, false, true]);
    expect(entries[2]?.streamWarnings.map((w) => w.code)).toEqual(["UNTERMINATED_STREAM_MESSAGE"]);
    expect(splitBatch(text).messages.map((entry) => entry.ok)).toEqual([true, false, true]);
  });

  it("strips a byte order mark's three bytes from bytes only: in text they are three letters", async () => {
    // A property test found this: splitBatch stripped the three letters from text as if they were
    // the bytes, and readMessages and parseHL7 did not.
    const body = `${MSH_A}\rPID|1\r`;
    const letters = `\u00ef\u00bb\u00bf${body}`;
    const fromText = await collect([letters]);
    const read: boolean[] = [];
    for await (const item of readMessages(letters)) read.push(item.ok);
    expect(fromText.map((entry) => entry.ok)).toEqual([false]);
    expect(splitBatch(letters).messages.map((entry) => entry.ok)).toEqual([false]);
    expect(read).toEqual([false]);
    expect(() => parseHL7(letters)).toThrow(Hl7ParseError);
    // The bytes of a byte order mark are still one, whole or cut, and the character U+FEFF too.
    const bytes = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(body, "latin1")]);
    for (const source of [[bytes], [bytes.subarray(0, 2), bytes.subarray(2)], [`\ufeff${body}`]]) {
      const [entry] = await collect(source);
      expect(entry?.ok).toBe(true);
      expect(entry?.raw).toBe(`${MSH_A}\rPID|1`);
    }
    expect(splitBatch(bytes).messages.map((entry) => entry.ok)).toEqual([true]);
  });

  it("yields the message before an unterminated final MSH, then the final one", async () => {
    const entries = await collect([`${MSH_A}\rPID|1\r${MSH_B}`]);
    expect(entries.map((e) => e.raw)).toEqual([`${MSH_A}\rPID|1`, MSH_B]);
    expect(entries[0]?.streamWarnings).toEqual([]);
    expect(entries[1]?.streamWarnings.map((w) => w.code)).toEqual(["UNTERMINATED_STREAM_MESSAGE"]);
  });
});
