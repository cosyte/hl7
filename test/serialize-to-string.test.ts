/**
 * Unit tests for `src/serialize/to-string.ts::emitMessage` — the Phase 5 Plan
 * 02 top-level emitter. Covers:
 * - D-06 MSH-1 / MSH-2 emission trace (exact inverse of `readDelimiters`).
 * - D-05 strict CR segment terminator + trailing CR.
 * - D-04 re-escape through the `emitField` chokepoint (SER-05).
 * - D-02 `isNull` preservation (literal `""`).
 * - D-07 purity (never throws; deterministic; non-mutating).
 * - D-08 no MLLP wrapping on output.
 * - D-03 byte-identical idempotency from the second pass.
 * - W3 trailing segment-level empty fields preserved.
 * - W4 explicit-input-shape 5-delimiter reescape.
 */

import { describe, expect, it } from "vitest";

import { parseHL7 } from "../src/index.js";
import { DEFAULT_ENCODING_CHARACTERS } from "../src/parser/delimiters.js";
import type { RawField } from "../src/parser/types.js";
import { emitField } from "../src/serialize/emit-field.js";

const BASE_MSH =
  "MSH|^~\\&|A|B|C|D|20260419|||MSG1|P|2.5\r";

describe("emitMessage — D-06 MSH special-case emission", () => {
  it("MSH-1 emits enc.field immediately after 'MSH'", () => {
    const msg = parseHL7(BASE_MSH);
    const out = msg.toString();
    // chars: "M","S","H", enc.field
    expect(out.charAt(3)).toBe("|");
  });

  it("MSH-2 emits enc.component+repetition+escape+subcomponent in fixed order", () => {
    const msg = parseHL7(BASE_MSH);
    const out = msg.toString();
    // chars 4..7 (inclusive) are the 4 MSH-2 chars.
    expect(out.slice(4, 8)).toBe("^~\\&");
  });

  it("MSH-3 starts after enc.field separator", () => {
    const msg = parseHL7(BASE_MSH);
    const out = msg.toString();
    expect(out.charAt(8)).toBe("|");
    // MSH-3 in fixture is "A".
    expect(out.charAt(9)).toBe("A");
  });

  it("custom encoding chars round-trip (field=#, component=@)", () => {
    const raw = "MSH#@~\\&#A#B#C#D#20260419###MSG1#P#2.5\r";
    const msg = parseHL7(raw);
    const out = msg.toString();
    expect(out.startsWith("MSH#@~\\&#")).toBe(true);
    // no standard "|" should appear since field sep is "#".
    expect(out.includes("|")).toBe(false);
  });
});

describe("emitMessage — D-05 segment terminator", () => {
  it("minimal single-segment message emits trailing \\r exactly once", () => {
    const msg = parseHL7(BASE_MSH);
    const out = msg.toString();
    expect(out.endsWith("\r")).toBe(true);
    // Only the trailing CR — count occurrences.
    expect(out.split("\r").length - 1).toBe(1);
  });

  it("multi-segment message joins with \\r and trails with \\r", () => {
    const raw =
      "MSH|^~\\&|A|B|C|D|20260419|||MSG1|P|2.5\r" +
      "PID|1||MRN001||Doe^John\r" +
      "PV1|1|I\r";
    const msg = parseHL7(raw);
    const out = msg.toString();
    // 3 segments, so 3 CRs (one after each).
    expect(out.split("\r").length - 1).toBe(3);
    expect(out.endsWith("\r")).toBe(true);
    // split("\r") yields 4 elements, last is "".
    const parts = out.split("\r");
    expect(parts.length).toBe(4);
    expect(parts[parts.length - 1]).toBe("");
  });

  it("input parsed from LF normalises to CR", () => {
    const rawLf =
      "MSH|^~\\&|A|B|C|D|20260419|||MSG1|P|2.5\n" +
      "PID|1||MRN001||Doe^John\n";
    const msg = parseHL7(rawLf);
    const out = msg.toString();
    expect(out.includes("\n")).toBe(false);
    expect(out.includes("\r")).toBe(true);
  });

  it("input parsed from CRLF normalises to CR", () => {
    const rawCrlf =
      "MSH|^~\\&|A|B|C|D|20260419|||MSG1|P|2.5\r\n" +
      "PID|1||MRN001||Doe^John\r\n";
    const msg = parseHL7(rawCrlf);
    const out = msg.toString();
    expect(out.includes("\n")).toBe(false);
    // Count CRs only — no CRLF pairs should survive.
    expect(out.split("\r").length - 1).toBe(2);
  });
});

describe("emitMessage — D-04 re-escape through emitField (SER-05)", () => {
  it("field with embedded | reescapes through emitField on round-trip", () => {
    // Build a message whose PID-5 subcomponent contains an HL7 escape \F\.
    // After parse, the Field.value is the literal "|"; on emit it re-escapes.
    const raw =
      "MSH|^~\\&|A|B|C|D|20260419|||MSG1|P|2.5\r" +
      "PID|1||MRN001||Smith\\F\\Jones^John\r";
    const msg = parseHL7(raw);
    const out = msg.toString();
    // The literal "|" from \F\ must NOT appear inside the PID name
    // subcomponent position — it must be re-escaped to \F\.
    expect(out).toContain("Smith\\F\\Jones");
  });

  it("field with embedded \\n emits \\.br\\", () => {
    // Parse decoded \.br\ → literal \n, then emit → \.br\.
    const raw =
      "MSH|^~\\&|A|B|C|D|20260419|||MSG1|P|2.5\r" +
      "OBX|1|TX|NOTE||line1\\.br\\line2||||F\r";
    const msg = parseHL7(raw);
    const out = msg.toString();
    expect(out).toContain("line1\\.br\\line2");
    expect(out.includes("\n")).toBe(false);
  });

  it("all 5 active delimiters round-trip (W4 — explicit input shape)", () => {
    const DELIM_CASES: ReadonlyArray<{ delim: string; expectedEscape: string }> = [
      { delim: "|", expectedEscape: "\\F\\" },
      { delim: "^", expectedEscape: "\\S\\" },
      { delim: "~", expectedEscape: "\\R\\" },
      { delim: "\\", expectedEscape: "\\E\\" },
      { delim: "&", expectedEscape: "\\T\\" },
    ];
    for (const { delim, expectedEscape } of DELIM_CASES) {
      const rawField: RawField = {
        repetitions: [
          { components: [{ subcomponents: ["a" + delim + "b"] }] },
        ],
        isNull: false,
      };
      expect(emitField(rawField, DEFAULT_ENCODING_CHARACTERS)).toBe(
        "a" + expectedEscape + "b",
      );
    }
  });
});

describe("emitMessage — D-02 isNull preservation", () => {
  it('explicit "" null field round-trips through emit', () => {
    const raw =
      'MSH|^~\\&|A|B|C|D|20260419|||MSG1|P|2.5\r' +
      'PID|1|""|MRN001||Doe^John\r';
    const msg = parseHL7(raw);
    const out = msg.toString();
    expect(out).toContain('PID|1|""|MRN001||Doe^John');
  });

  it("absent field vs null distinct on output", () => {
    const rawAbsent =
      "MSH|^~\\&|A|B|C|D|20260419|||MSG1|P|2.5\r" +
      "PID|1||MRN001\r";
    const rawNull =
      'MSH|^~\\&|A|B|C|D|20260419|||MSG1|P|2.5\r' +
      'PID|1|""|MRN001\r';
    const outAbsent = parseHL7(rawAbsent).toString();
    const outNull = parseHL7(rawNull).toString();
    expect(outAbsent).toContain("PID|1||MRN001");
    expect(outNull).toContain('PID|1|""|MRN001');
    expect(outAbsent).not.toContain('""');
  });
});

describe("emitMessage — D-07 purity", () => {
  it("never throws on diverse parseable inputs", () => {
    const inputs = [
      BASE_MSH,
      "MSH|^~\\&|A|B|C|D|20260419|||MSG1|P|2.5\rPID|1||MRN001\r",
      "MSH|^~\\&|A|B|C|D|20260419|||MSG1|P|2.5\rOBX|1|TX|NOTE||line1\\.br\\line2||||F\r",
    ];
    for (const raw of inputs) {
      const msg = parseHL7(raw);
      expect(() => msg.toString()).not.toThrow();
    }
  });

  it("deterministic — two back-to-back toString() calls return identical strings", () => {
    const msg = parseHL7(BASE_MSH);
    expect(msg.toString()).toBe(msg.toString());
  });

  it("does not mutate msg", () => {
    const msg = parseHL7(
      "MSH|^~\\&|A|B|C|D|20260419|||MSG1|P|2.5\rPID|1||MRN001\r",
    );
    const before = JSON.stringify(msg.rawSegments);
    msg.toString();
    const after = JSON.stringify(msg.rawSegments);
    expect(after).toBe(before);
  });

  it("toString reflects mutation on repeat calls (no stale cache, D-30)", () => {
    const msg = parseHL7(
      "MSH|^~\\&|A|B|C|D|20260419|||MSG1|P|2.5\rPID|1||MRN001\r",
    );
    const before = msg.toString();
    msg.setField("PID.3", "MRN999");
    const after = msg.toString();
    expect(after).not.toBe(before);
    expect(after).toContain("MRN999");
    expect(after).not.toContain("MRN001");
  });
});

describe("emitMessage — D-08 no MLLP framing", () => {
  it("no MLLP bytes on output even when input was MLLP-framed", () => {
    const raw =
      "\x0BMSH|^~\\&|A|B|C|D|20260419|||MSG1|P|2.5\rPID|1||MRN001\r\x1C\r";
    const msg = parseHL7(raw);
    const out = msg.toString();
    expect(out.includes("\x0B")).toBe(false);
    expect(out.includes("\x1C")).toBe(false);
    expect(out.includes("\x1D")).toBe(false);
  });
});

describe("emitMessage — D-03 idempotency (byte-identical from second pass)", () => {
  it("second pass is byte-identical to first — canonical", () => {
    const raw = BASE_MSH + "PID|1||MRN001||Doe^John\r";
    const once = parseHL7(raw).toString();
    const twice = parseHL7(once).toString();
    expect(twice).toBe(once);
  });

  it("second pass is byte-identical to first — MLLP-framed input", () => {
    const raw =
      "\x0BMSH|^~\\&|A|B|C|D|20260419|||MSG1|P|2.5\rPID|1||MRN001\r\x1C\r";
    const once = parseHL7(raw).toString();
    const twice = parseHL7(once).toString();
    expect(twice).toBe(once);
  });
});

describe("emitMessage — W3 trailing segment-level empty fields preserved", () => {
  it("trailing empty fields at segment level preserved — PID with mid/trail empties", () => {
    const raw =
      "MSH|^~\\&|A|B|C|D|20260419|||MSG1|P|2.5\r" +
      "PID|1|2|3||5||\r";
    const msg = parseHL7(raw);
    const out = msg.toString();
    expect(out).toContain("PID|1|2|3||5||\r");
    expect(out.includes("PID|1|2|3||5\r")).toBe(false);
  });

  it("trailing empty fields preserved on MSH-3..N", () => {
    const raw =
      "MSH|^~\\&|A|B|C|D|20260419|||MSG1|P|2.5|||\r";
    const msg = parseHL7(raw);
    const out = msg.toString();
    // output's first (only) segment should end with "2.5|||" before the \r.
    expect(out).toContain("2.5|||");
    expect(out.endsWith("2.5|||\r")).toBe(true);
  });

  it("segment with trailing empty fields — structural round-trip preserves field count", () => {
    // PID with 10 positions after name: "1","","","","","","present","","",""
    const raw =
      "MSH|^~\\&|A|B|C|D|20260419|||MSG1|P|2.5\r" +
      "PID|1||||||present||||\r";
    const msg = parseHL7(raw);
    const roundTripped = parseHL7(msg.toString());
    const pid = roundTripped.rawSegments.find((s) => s.name === "PID");
    expect(pid).toBeDefined();
    // fields[0] is placeholder + 10 HL7 positions = 11 entries.
    expect(pid?.fields.length).toBe(11);
  });
});
