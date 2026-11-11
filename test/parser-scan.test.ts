/**
 * The scanner: one pass over a normalized message that finds every segment boundary, every
 * segment name, and every finding the tree build would report, without building the tree. Every
 * message here is synthetic.
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { messageText } from "../src/arbitraries/index.js";
import { DEFAULT_ENCODING_CHARACTERS, readDelimiters } from "../src/parser/delimiters.js";
import { normalize } from "../src/parser/normalize.js";
import {
  HOLDS_ESCAPE,
  PLAIN_FIELD_LIMIT,
  Scanner,
  scanMessage,
  type ScanSink,
} from "../src/parser/scan.js";
import { splitSegments } from "../src/parser/segments.js";
import { tokenize } from "../src/parser/tokenize.js";
import type { EncodingCharacters } from "../src/parser/types.js";
import { stripMllp } from "../src/parser/mllp.js";
import { WARNING_CODES, type Hl7ParseWarning } from "../src/parser/warnings.js";

import { checkProperty } from "./_helpers/property.js";

const enc = DEFAULT_ENCODING_CHARACTERS;

interface Findings {
  readonly sink: ScanSink;
  readonly warnings: Hl7ParseWarning[];
  readonly trimmed: [number, number][];
}

function findings(): Findings {
  const warnings: Hl7ParseWarning[] = [];
  const trimmed: [number, number][] = [];
  return {
    warnings,
    trimmed,
    sink: {
      warn: (w) => warnings.push(w),
      trimmed: (segmentIndex, rawFieldIndex) => trimmed.push([segmentIndex, rawFieldIndex]),
    },
  };
}

/** Each segment's text, as the table says. */
function segmentTexts(text: string, table: Uint32Array, count: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    out.push(text.slice(table[2 * i], (table[2 * i + 2] as number) - 1));
  }
  return out;
}

/** Each segment's scan flags, as the table holds them. */
function flagsOf(table: Uint32Array, count: number): number[] {
  return Array.from({ length: count }, (_v, i) => table[2 * i + 1] as number);
}

describe("scanMessage: boundaries and names", () => {
  it("finds each segment's start and name, and one past the end of the last", () => {
    const text = "MSH|^~\\&|A\rPID|1\r";
    const { table, count, names } = scanMessage(text, enc, true, findings().sink);
    expect(count).toBe(2);
    expect([table[0], table[2], table[4]]).toEqual([0, 11, 17]);
    expect(names).toEqual(["MSH", "PID"]);
    expect(segmentTexts(text, table, count)).toEqual(["MSH|^~\\&|A", "PID|1"]);
  });

  it("splits exactly as splitSegments does: a middle empty segment kept, one trailing CR dropped", () => {
    for (const text of [
      "MSH|^~\\&|A\r\rPID|1",
      "MSH|^~\\&|A\rPID|1\r\r",
      "MSH|^~\\&|A",
      "MSH|^~\\&|A\rZZZ\rpid|1|2\r",
    ]) {
      const { table, count, names } = scanMessage(text, enc, true, findings().sink);
      const expected = splitSegments(text);
      expect(segmentTexts(text, table, count)).toEqual(expected);
      expect(names).toEqual(expected.map((s) => s.split("|")[0]));
    }
  });

  it("names a segment with no field separator by its whole text", () => {
    const { names } = scanMessage("MSH|^~\\&\rZZZ\r\rNTE", enc, true, findings().sink);
    expect(names).toEqual(["MSH", "ZZZ", "", "NTE"]);
  });

  it("holds more segments than its first allocation", () => {
    const text = "MSH|^~\\&\r" + "OBX|1\r".repeat(300);
    const { table, count, names } = scanMessage(text, enc, true, findings().sink);
    expect(count).toBe(301);
    expect(names).toHaveLength(301);
    expect(table[2 * 301]).toBe(text.length);
    expect(segmentTexts(text, table, count).slice(-2)).toEqual(["OBX|1", "OBX|1"]);
    expect(names.every((n, i) => n === (i === 0 ? "MSH" : "OBX"))).toBe(true);
  });

  it("gives every segment of one name the same name string", () => {
    const { names } = scanMessage("MSH|^~\\&\rOBX|1\rOBX|2", enc, true, findings().sink);
    expect(names[1]).toBe("OBX");
    expect(names[2]).toBe(names[1]);
  });

  it("still names every segment after more distinct names than it keeps for reuse", () => {
    const distinct = Array.from({ length: 40 }, (_v, i) => `Z${String(i).padStart(2, "0")}`);
    const text = ["MSH|^~\\&", ...distinct.map((n) => `${n}|x`), "Z00|y", "Z39|y"].join("\r");
    const { names } = scanMessage(text, enc, true, findings().sink);
    expect(names).toEqual(["MSH", ...distinct, "Z00", "Z39"]);
  });
});

describe("scanMessage: findings", () => {
  it("reports a trimmed field with its HL7 position and its tree position", () => {
    const f = findings();
    scanMessage("MSH|^~\\&| APP\rPID|1||  Doe \r", enc, true, f.sink);
    expect(f.warnings.map((w) => [w.code, w.position, w.message])).toEqual([
      [
        WARNING_CODES.FIELD_WHITESPACE_TRIMMED,
        { segmentIndex: 0, fieldIndex: 3 },
        "Field had 1 leading whitespace character(s) trimmed.",
      ],
      [
        WARNING_CODES.FIELD_WHITESPACE_TRIMMED,
        { segmentIndex: 1, fieldIndex: 3 },
        "Field had 2 leading + 1 trailing whitespace character(s) trimmed.",
      ],
    ]);
    // MSH-3 is index 2 of MSH's fields; PID-3 is index 3 of PID's.
    expect(f.trimmed).toEqual([
      [0, 2],
      [1, 3],
    ]);
  });

  it("reports a field with whitespace inside only, all whitespace, or no whitespace not at all", () => {
    const f = findings();
    scanMessage("MSH|^~\\&\rPID|a b|   |éxé| ", enc, true, f.sink);
    expect(f.warnings).toEqual([]);
  });

  it("reports whitespace beyond ASCII at either end, as String.prototype.trim sees it", () => {
    const f = findings();
    scanMessage("MSH|^~\\&\rPID| x|x　|﻿x", enc, true, f.sink);
    expect(f.trimmed).toEqual([
      [1, 1],
      [1, 2],
      [1, 3],
    ]);
  });

  it("reports no trim finding when fields are not trimmed", () => {
    const f = findings();
    scanMessage("MSH|^~\\&\rPID| x ", enc, false, f.sink);
    expect(f.warnings).toEqual([]);
    expect(f.trimmed).toEqual([]);
  });

  it("reports each unknown and unterminated escape at its subcomponent", () => {
    const f = findings();
    scanMessage("MSH|^~\\&\rNTE|1|a~b^c&\\Q\\|\\F\\ok|x\\Zy", enc, true, f.sink);
    expect(f.warnings.map((w) => [w.code, w.position, w.message])).toEqual([
      [
        WARNING_CODES.UNKNOWN_ESCAPE_SEQUENCE,
        {
          segmentIndex: 1,
          fieldIndex: 2,
          repetitionIndex: 2,
          componentIndex: 2,
          subcomponentIndex: 2,
        },
        "Unknown HL7 escape sequence (1 chars) preserved verbatim.",
      ],
      [
        WARNING_CODES.UNKNOWN_ESCAPE_SEQUENCE,
        {
          segmentIndex: 1,
          fieldIndex: 4,
          repetitionIndex: 1,
          componentIndex: 1,
          subcomponentIndex: 1,
        },
        "Unterminated HL7 escape sequence preserved verbatim.",
      ],
    ]);
  });

  it("reports a field's trim before its escapes, and counts escapes in the trimmed value", () => {
    const f = findings();
    scanMessage("MSH|^~\\&\rNTE| \\Q\\ ", enc, true, f.sink);
    expect(f.warnings.map((w) => w.code)).toEqual([
      WARNING_CODES.FIELD_WHITESPACE_TRIMMED,
      WARNING_CODES.UNKNOWN_ESCAPE_SEQUENCE,
    ]);
    expect(f.warnings[1]?.position.componentIndex).toBe(1);
  });

  it("reports nothing in a trimmed field that holds no escape", () => {
    const f = findings();
    scanMessage("MSH|^~\\&\rNTE| x |\\Q\\", enc, true, f.sink);
    expect(f.warnings.map((w) => w.code)).toEqual([
      WARNING_CODES.FIELD_WHITESPACE_TRIMMED,
      WARNING_CODES.UNKNOWN_ESCAPE_SEQUENCE,
    ]);
    expect(f.warnings[1]?.position.fieldIndex).toBe(2);
  });

  it("never reads MSH-2 for findings, and numbers MSH fields as HL7 does", () => {
    const f = findings();
    scanMessage("MSH|^~\\&|\\Q\\", enc, true, f.sink);
    expect(f.warnings.map((w) => w.position)).toEqual([
      {
        segmentIndex: 0,
        fieldIndex: 3,
        repetitionIndex: 1,
        componentIndex: 1,
        subcomponentIndex: 1,
      },
    ]);
  });

  it("treats a later segment named MSH as MSH", () => {
    const f = findings();
    scanMessage("MSH|^~\\&\rMSH|\\Q\\| x", enc, true, f.sink);
    expect(f.warnings.map((w) => w.position.fieldIndex)).toEqual([3]);
    expect(f.trimmed).toEqual([[1, 2]]);
  });

  it("reports nothing for an empty field or an explicit null", () => {
    const f = findings();
    scanMessage('MSH|^~\\&\rPID||""|" "', enc, true, f.sink);
    expect(f.warnings).toEqual([]);
  });

  it("finds an escape in a field far past an earlier one, and none in the fields between", () => {
    const f = findings();
    const filler = "|plain".repeat(50);
    scanMessage(`MSH|^~\\&\rNTE|\\Q\\${filler}|\\Q\\\rNTE${filler}\rNTE|\\Q\\`, enc, true, f.sink);
    expect(f.warnings.map((w) => [w.position.segmentIndex, w.position.fieldIndex])).toEqual([
      [1, 1],
      [1, 52],
      [3, 1],
    ]);
  });

  it("honours custom encoding characters", () => {
    const custom: EncodingCharacters = readDelimiters("MSH#$%*@");
    const f = findings();
    const { names } = scanMessage("MSH#$%*@# A\rPID#a*Q*b# c", custom, true, f.sink);
    expect(names).toEqual(["MSH", "PID"]);
    expect(f.warnings.map((w) => [w.code, w.position.segmentIndex, w.position.fieldIndex])).toEqual(
      [
        [WARNING_CODES.FIELD_WHITESPACE_TRIMMED, 0, 3],
        [WARNING_CODES.UNKNOWN_ESCAPE_SEQUENCE, 1, 1],
        [WARNING_CODES.FIELD_WHITESPACE_TRIMMED, 1, 2],
      ],
    );
  });
});

describe("scanMessage: what each segment's build needs", () => {
  it("flags a segment holding the escape character, wherever it stands in the segment", () => {
    const text = "MSH|^~\\&|A\rNTE|\\Q\\|b|c\rNTE|a|b|\\Q\\\rNTE|a|b|c\rNTE|a~\\H\\|b";
    const { table, count } = scanMessage(text, enc, true, findings().sink);
    expect(flagsOf(table, count).map((f) => (f & HOLDS_ESCAPE) !== 0)).toEqual([
      true,
      true,
      true,
      false,
      true,
    ]);
  });

  it("marks the fields it read whole and found no structure separator in", () => {
    const long = "x".repeat(40);
    const text = `MSH|^~\\&|A\rZZX|1||a^b|c~d|e&f|k9|${long}|"" |\rZZZ`;
    const { table, count } = scanMessage(text, enc, true, findings().sink);
    const zzx = flagsOf(table, count)[1] as number;
    const plain = Array.from({ length: 10 }, (_v, n) => n > 0 && ((zzx >>> (n - 1)) & 1) === 1);
    // Fields 1 ("1"), 2 (empty), 6 ("k9"), 8 ('"" ') and the empty 9 after the trailing separator
    // are plain; 3 to 5 hold a separator; 7 is longer than the scanner reads a character at a
    // time, so it is not marked.
    expect(plain).toEqual([false, true, true, false, false, false, true, false, true, true]);
    expect(flagsOf(table, count)[2]).toBe(0);
  });

  it("marks no field past the last one a flag bit is kept for", () => {
    const fields = Array.from({ length: 40 }, (_v, i) => String(i + 1));
    const { table, count } = scanMessage(
      `MSH|^~\\&\rOBX|${fields.join("|")}`,
      enc,
      true,
      findings().sink,
    );
    const obx = flagsOf(table, count)[1] as number;
    expect(obx >>> 0).toBe(0x7fffffff);
    expect(PLAIN_FIELD_LIMIT).toBe(31);
  });
});

describe("tokenize: the scan, then the build", () => {
  it("trims every trimmed field of a segment", () => {
    const tree = tokenize(["MSH|^~\\&", "PID| a | b |c"], enc, () => undefined, true);
    const values = tree[1]?.fields
      .slice(1)
      .map((f) => f.repetitions[0]?.components[0]?.subcomponents[0]);
    expect(values).toEqual(["a", "b", "c"]);
  });
});

describe("Scanner: one segment at a time", () => {
  it("reports for one segment string what a scan of the whole message reports for it", () => {
    const whole = findings();
    scanMessage("MSH|^~\\&\rNTE| \\Q\\ |x", enc, true, whole.sink);
    const one = findings();
    const name = new Scanner("NTE| \\Q\\ |x", enc, true, one.sink).segment(0, 11, 1);
    expect(name).toBe("NTE");
    expect(one.warnings).toEqual(whole.warnings);
    expect(one.trimmed).toEqual(whole.trimmed);
  });
});

/** Check that a scan of `raw` reports what `tokenize` reports, and finds the names it builds. */
function expectScanAgrees(raw: string): void {
  const text = normalize(stripMllp(raw).stripped);
  const segments = splitSegments(text);
  let custom: EncodingCharacters;
  try {
    custom = readDelimiters(segments[0] ?? "");
  } catch {
    return;
  }
  for (const trimFields of [true, false]) {
    const scanned = findings();
    const { names } = scanMessage(text, custom, trimFields, scanned.sink);
    const tokenized: Hl7ParseWarning[] = [];
    const tree = tokenize(segments, custom, (w) => tokenized.push(w), trimFields);
    expect(scanned.warnings).toEqual(tokenized);
    expect(names).toEqual(tree.map((s) => s.name));
  }
}

describe("scanMessage: the findings tokenize reports, segment by segment", () => {
  it("agrees when a long field's separator search already ran past the next long field", () => {
    // The last field of PID is longer than a short field and holds no separator, so the search
    // for one runs on into the next segment and stops after its 40-character name. That name is
    // long too, and its search reuses the remembered separator rather than searching again.
    const longName = "Z".repeat(40);
    expectScanAgrees(`MSH|^~\\&|A\rPID|1|${"x".repeat(40)}\r${longName}|a`);
    const scanned = findings();
    const text = `MSH|^~\\&|A\rPID|1|${"x".repeat(40)}\r${longName}|a`;
    expect(scanMessage(text, enc, true, scanned.sink).names).toEqual(["MSH", "PID", longName]);
  });

  it("agrees with tokenize on every generated message, quirks included", () => {
    checkProperty(
      fc.property(messageText(), (raw) => {
        expectScanAgrees(raw);
      }),
      // property-depth: 300 cases on a pull request, as this test ran before the shared runner.
      { numRuns: 300 },
    );
  });
});
