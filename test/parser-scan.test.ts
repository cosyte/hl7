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
import { Scanner, scanMessage, type ScanSink } from "../src/parser/scan.js";
import { splitSegments } from "../src/parser/segments.js";
import { tokenize } from "../src/parser/tokenize.js";
import type { EncodingCharacters } from "../src/parser/types.js";
import { stripMllp } from "../src/parser/mllp.js";
import { WARNING_CODES, type Hl7ParseWarning } from "../src/parser/warnings.js";

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

/** Each segment's text, as the offsets say. */
function segmentTexts(text: string, offsets: Uint32Array): string[] {
  const out: string[] = [];
  for (let i = 0; i + 1 < offsets.length; i++) {
    out.push(text.slice(offsets[i], (offsets[i + 1] as number) - 1));
  }
  return out;
}

describe("scanMessage: boundaries and names", () => {
  it("finds each segment's start and name, and one past the end of the last", () => {
    const text = "MSH|^~\\&|A\rPID|1\r";
    const { offsets, names } = scanMessage(text, enc, true, findings().sink);
    expect(Array.from(offsets)).toEqual([0, 11, 17]);
    expect(names).toEqual(["MSH", "PID"]);
    expect(segmentTexts(text, offsets)).toEqual(["MSH|^~\\&|A", "PID|1"]);
  });

  it("splits exactly as splitSegments does: a middle empty segment kept, one trailing CR dropped", () => {
    for (const text of [
      "MSH|^~\\&|A\r\rPID|1",
      "MSH|^~\\&|A\rPID|1\r\r",
      "MSH|^~\\&|A",
      "MSH|^~\\&|A\rZZZ\rpid|1|2\r",
    ]) {
      const { offsets, names } = scanMessage(text, enc, true, findings().sink);
      const expected = splitSegments(text);
      expect(segmentTexts(text, offsets)).toEqual(expected);
      expect(names).toEqual(expected.map((s) => s.split("|")[0]));
    }
  });

  it("names a segment with no field separator by its whole text", () => {
    const { names } = scanMessage("MSH|^~\\&\rZZZ\r\rNTE", enc, true, findings().sink);
    expect(names).toEqual(["MSH", "ZZZ", "", "NTE"]);
  });

  it("holds more segments than its first allocation", () => {
    const text = "MSH|^~\\&\r" + "OBX|1\r".repeat(300);
    const { offsets, names } = scanMessage(text, enc, true, findings().sink);
    expect(names).toHaveLength(301);
    expect(offsets).toHaveLength(302);
    expect(offsets[301]).toBe(text.length);
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

describe("scanMessage: the findings tokenize reports, segment by segment", () => {
  it("agrees with tokenize on every generated message, quirks included", () => {
    fc.assert(
      fc.property(messageText(), (raw) => {
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
      }),
      { numRuns: 300, seed: 0x5ca7 },
    );
  });
});
