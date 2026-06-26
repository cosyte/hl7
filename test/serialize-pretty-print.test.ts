/**
 * Unit tests for `src/serialize/pretty-print.ts::emitPrettyPrint` (SER-04).
 *
 * Organised by Phase 5 Plan 04 decision block:
 * - Block 1 (D-25 header): exact format, missing-meta renders as `-`, always
 *   ends with `(N segments)`, two-space separator between header fields.
 * - Block 2 (D-23 segment lines): labeled `[N]=value` fields, MSH starts at
 *   [3], non-MSH starts at [1], suppression of empty-emitted fields,
 *   `isNull` preserved as `[N]=""`.
 * - Block 3 (D-24 depth): composites render as raw HL7 strings (depth stops
 *   at field level).
 * - Block 4 (W2 raw-escape rendering): embedded delimiters appear as the
 *   HL7 escape forms via `emitField` re-escape (Plan 01 chokepoint). All 5
 *   active delimiters + `\n -> \.br\`.
 * - Block 5 (line structure): LF separator, no trailing newline, no CR.
 * - Block 6 (D-26 purity): deterministic, non-mutating, never throws.
 *
 * The shared Phase 2 tokenize invariant (Plan 02): `rawSegments` holds
 * DECODED subcomponents. An input `\F\` becomes a literal `|` in the raw
 * tree; emit-time `emitField` re-escapes back to `\F\`. These tests verify
 * that pretty-print output shows the escape form (round-trip fidelity),
 * not the decoded char.
 */

import { describe, expect, it } from "vitest";

import { Hl7Message } from "../src/model/message.js";
import { DEFAULT_ENCODING_CHARACTERS } from "../src/parser/delimiters.js";
import type { RawField, RawSegment } from "../src/parser/types.js";
import { parseHL7 } from "../src/index.js";

// --- Fixtures --------------------------------------------------------------

// Canonical ADT^A01 - used to exercise the happy path of both header and
// segment-line formatting. 5 segments (MSH + EVN + PID + PV1 + OBX).
const CANONICAL_ADT =
  "MSH|^~\\&|EPIC|MAIN|LIS|REF|20260419101500||ADT^A01^ADT_A01|MSG00001|P|2.5\r" +
  "EVN|A01|20260419101500\r" +
  "PID|1||MRN12345^^^HOSP^MR||Doe^John^Q||19800115|M\r" +
  "PV1|1|I|ICU^101^A\r" +
  "OBX|1|NM|GLUC^Glucose^LN||95|mg/dL^^UCUM\r";

// MSH-only - D-26 edge case (emits header + 1 segment line).
const MSH_ONLY = "MSH|^~\\&|EPIC|MAIN|LIS|REF|20260419101500||ADT^A01|MSG00001|P|2.5\r";

// MSH with minimal MSH-9 (empty message-type) so meta.type is undefined for
// the "header renders missing type as '-'" test. MSH-10 and MSH-7 are also
// absent so we exercise all three `-` fallbacks on one message.
const MSH_MINIMAL = "MSH|^~\\&|A|B|C|D||||\r";

// Helper - construct an Hl7Message directly (no parse) when we need to
// inject synthetic shapes (e.g. explicit null fields) that are easier to
// assemble by hand than via HL7 text.
function makeMsg(segments: readonly RawSegment[]): Hl7Message {
  return new Hl7Message({
    segments,
    encodingCharacters: DEFAULT_ENCODING_CHARACTERS,
    version: "2.5",
    warnings: [],
  });
}

// Minimal MSH segment for hand-built fixtures - MSH-9 = ADT^A01 so
// `meta.type` resolves; MSH-10 = MSG1; MSH-7 = "20260419101500".
function makeMshSegment(): RawSegment {
  const comp = (value: string): RawField => ({
    repetitions: [{ components: [{ subcomponents: [value] }] }],
    isNull: false,
  });
  const empty: RawField = { repetitions: [], isNull: false };
  return {
    name: "MSH",
    fields: [
      // fields[0] = field-separator placeholder.
      { repetitions: [{ components: [{ subcomponents: ["|"] }] }], isNull: false },
      // fields[1] = MSH-2 encoding chars placeholder.
      { repetitions: [{ components: [{ subcomponents: ["^~\\&"] }] }], isNull: false },
      comp("A"), // MSH-3
      comp("B"), // MSH-4
      comp("C"), // MSH-5
      comp("D"), // MSH-6
      comp("20260419101500"), // MSH-7
      empty, // MSH-8
      // MSH-9 = "ADT^A01" across 2 components.
      {
        repetitions: [
          {
            components: [{ subcomponents: ["ADT"] }, { subcomponents: ["A01"] }],
          },
        ],
        isNull: false,
      },
      comp("MSG1"), // MSH-10
      comp("P"), // MSH-11
      comp("2.5"), // MSH-12
    ],
  };
}

// --- Block 1: Header (D-25) ----------------------------------------------

describe("emitPrettyPrint - Block 1: D-25 header", () => {
  it("header starts with 'HL7 '", () => {
    const out = parseHL7(CANONICAL_ADT).prettyPrint();
    const [firstLine] = out.split("\n");
    expect(firstLine?.startsWith("HL7 ")).toBe(true);
  });

  it("header contains type when present", () => {
    const out = parseHL7(CANONICAL_ADT).prettyPrint();
    const [firstLine] = out.split("\n");
    expect(firstLine).toContain("ADT^A01^ADT_A01");
  });

  it("header renders missing type as '-'", () => {
    const out = parseHL7(MSH_MINIMAL).prettyPrint();
    const [firstLine] = out.split("\n");
    // type is the first slot after "HL7 ".
    expect(firstLine?.startsWith("HL7 -")).toBe(true);
  });

  it("header contains 'controlId=<id>' (two-space separator) when present", () => {
    const out = parseHL7(CANONICAL_ADT).prettyPrint();
    const [firstLine] = out.split("\n");
    expect(firstLine).toContain("  controlId=MSG00001  ");
  });

  it("header renders missing controlId as '-'", () => {
    const out = parseHL7(MSH_MINIMAL).prettyPrint();
    const [firstLine] = out.split("\n");
    expect(firstLine).toContain("controlId=-");
  });

  it("header contains timestamp=<ISO> when present", () => {
    const out = parseHL7(CANONICAL_ADT).prettyPrint();
    const [firstLine] = out.split("\n");
    // MSH-7 = "20260419101500" -> UTC Date -> ISO string.
    const expectedIso = new Date(Date.UTC(2026, 3, 19, 10, 15, 0)).toISOString();
    expect(firstLine).toContain(`timestamp=${expectedIso}`);
  });

  it("header renders missing timestamp as '-'", () => {
    const out = parseHL7(MSH_MINIMAL).prettyPrint();
    const [firstLine] = out.split("\n");
    expect(firstLine).toContain("timestamp=-");
  });

  it("header ends with '(<N> segments)' - N = rawSegments.length", () => {
    const out = parseHL7(CANONICAL_ADT).prettyPrint();
    const [firstLine] = out.split("\n");
    expect(firstLine?.endsWith("(5 segments)")).toBe(true);
  });

  it("header uses exactly two spaces between each labeled field", () => {
    const out = parseHL7(CANONICAL_ADT).prettyPrint();
    const [firstLine] = out.split("\n");
    expect(firstLine).toMatch(/^HL7 .+ {2}controlId=.+ {2}timestamp=.+ {2}\(\d+ segments\)$/u);
  });
});

// --- Block 2: Segment lines (D-23) ---------------------------------------

describe("emitPrettyPrint - Block 2: D-23 segment lines", () => {
  it("MSH line starts at [3] (never [1] or [2])", () => {
    const out = parseHL7(CANONICAL_ADT).prettyPrint();
    const mshLine = out.split("\n").find((l) => l.startsWith("MSH"));
    expect(mshLine).toBeDefined();
    expect(mshLine).toContain("[3]=EPIC");
    expect(mshLine).not.toContain("[1]=");
    expect(mshLine).not.toContain("[2]=");
  });

  it("non-MSH segment starts at [1]", () => {
    const out = parseHL7(CANONICAL_ADT).prettyPrint();
    const pidLine = out.split("\n").find((l) => l.startsWith("PID"));
    expect(pidLine).toBeDefined();
    // PID-1 = "1" -> label "[1]=1" is the first labeled field.
    expect(pidLine).toContain("[1]=1");
  });

  it("segment name is followed by two spaces then the first label", () => {
    const out = parseHL7(CANONICAL_ADT).prettyPrint();
    const pidLine = out.split("\n").find((l) => l.startsWith("PID"));
    expect(pidLine).toMatch(/^PID {2}\[\d+\]=/u);
  });

  it("labeled fields are separated by exactly two spaces", () => {
    const out = parseHL7(CANONICAL_ADT).prettyPrint();
    const pidLine = out.split("\n").find((l) => l.startsWith("PID"));
    // Any two consecutive labels should have "  " between them.
    expect(pidLine).toMatch(/\]=.+ {2}\[\d+\]=/u);
  });

  it("segment with no content fields is just the name (no trailing spaces)", () => {
    // Parse an MSH + NTE where the NTE has only a name-placeholder field.
    const raw = "MSH|^~\\&|A|B|C|D|20260419|||ADT^A01|M1|P|2.5\r" + "NTE\r";
    const out = parseHL7(raw).prettyPrint();
    const nteLine = out.split("\n").find((l) => l.startsWith("NTE"));
    expect(nteLine).toBe("NTE");
  });

  it("empty fields are suppressed (no `[N]=` entries)", () => {
    // PID|1|||||Doe^John  - PID-1 + PID-6 present; PID-2..5 empty.
    const raw = "MSH|^~\\&|A|B|C|D|20260419|||ADT^A01|M1|P|2.5\r" + "PID|1|||||Doe^John\r";
    const out = parseHL7(raw).prettyPrint();
    const pidLine = out.split("\n").find((l) => l.startsWith("PID"));
    expect(pidLine).toBe("PID  [1]=1  [6]=Doe^John");
  });

  it('isNull field renders as `[N]=""`', () => {
    // Hand-build PID with PID-2 = null field so we don't depend on the
    // parser's tokenize semantics for `""`.
    const nullField: RawField = { repetitions: [], isNull: true };
    const mrnField: RawField = {
      repetitions: [{ components: [{ subcomponents: ["MRN001"] }] }],
      isNull: false,
    };
    const pid: RawSegment = {
      name: "PID",
      fields: [
        { repetitions: [], isNull: false }, // fields[0] placeholder
        {
          // PID-1 = "1"
          repetitions: [{ components: [{ subcomponents: ["1"] }] }],
          isNull: false,
        },
        nullField, // PID-2 = null
        mrnField, // PID-3 = "MRN001"
      ],
    };
    const msg = makeMsg([makeMshSegment(), pid]);
    const out = msg.prettyPrint();
    const pidLine = out.split("\n").find((l) => l.startsWith("PID"));
    // isNull emits the two-character literal `""` - so the label is `[2]=""`.
    expect(pidLine).toContain('[2]=""');
  });

  it("field numbers are HL7 1-indexed for non-MSH segments", () => {
    // PID|1||MRN...  - PID-3 = MRN field, at HL7 index 3 (not 2).
    const raw = "MSH|^~\\&|A|B|C|D|20260419|||ADT^A01|M1|P|2.5\r" + "PID|1||MRN001^^^HOSP^MR\r";
    const out = parseHL7(raw).prettyPrint();
    const pidLine = out.split("\n").find((l) => l.startsWith("PID"));
    expect(pidLine).toContain("[3]=MRN001^^^HOSP^MR");
    // PID-2 is absent, should not appear.
    expect(pidLine).not.toContain("[2]=");
  });

  it("composite value rendered as raw HL7 string (not broken into components)", () => {
    const out = parseHL7(CANONICAL_ADT).prettyPrint();
    const pidLine = out.split("\n").find((l) => l.startsWith("PID"));
    // PID-5 = Doe^John^Q - entire composite, verbatim.
    expect(pidLine).toContain("[5]=Doe^John^Q");
  });
});

// --- Block 3: Depth (D-24) -----------------------------------------------

describe("emitPrettyPrint - Block 3: D-24 depth stops at field level", () => {
  it("subcomponent-containing field renders raw HL7 string", () => {
    // PID-3 CX with assigningAuthority subcomponents:
    // "MRN^^^HOSP&1.2.3&ISO^MR" - the `HOSP&1.2.3&ISO` subcomponent chain
    // must appear verbatim in the label.
    const raw =
      "MSH|^~\\&|A|B|C|D|20260419|||ADT^A01|M1|P|2.5\r" + "PID|1||MRN001^^^HOSP&1.2.3&ISO^MR\r";
    const out = parseHL7(raw).prettyPrint();
    const pidLine = out.split("\n").find((l) => l.startsWith("PID"));
    expect(pidLine).toContain("[3]=MRN001^^^HOSP&1.2.3&ISO^MR");
  });
});

// --- Block 4: W2 raw-escape rendering ------------------------------------

describe("emitPrettyPrint - Block 4: W2 raw-escape rendering via emitField", () => {
  it("user content with embedded `|` renders as `\\F\\`", () => {
    // Input PID-5 with escaped `|` inside the family name subcomponent.
    // Phase 2 tokenize decodes `\F\` -> `|` in the raw tree; emitField
    // re-escapes back to `\F\` on emit.
    const raw =
      "MSH|^~\\&|A|B|C|D|20260419|||ADT^A01|M1|P|2.5\r" + "PID|1||MRN001||Smith\\F\\Jones^John\r";
    const out = parseHL7(raw).prettyPrint();
    const pidLine = out.split("\n").find((l) => l.startsWith("PID"));
    expect(pidLine).toBeDefined();
    // Extract the PID-5 label value - starts after `[5]=` and ends at two
    // consecutive spaces OR EOL.
    const match = /\[5\]=([^\n]+?)(?: {2}\[|$)/u.exec(pidLine ?? "");
    const pid5 = match?.[1] ?? "";
    expect(pid5).toContain("\\F\\");
    // The decoded `|` char MUST NOT appear in the emitted field value -
    // emitField's reescape has converted every literal `|` back to `\F\`.
    expect(pid5.includes("|")).toBe(false);
  });

  it("user content with embedded `\\n` renders as `\\.br\\`", () => {
    // OBX-5 with an embedded `\.br\` sequence - Phase 2 decodes it to a
    // literal `\n`; emitField re-escapes back to `\.br\`.
    const raw =
      "MSH|^~\\&|A|B|C|D|20260419|||ORU^R01|M1|P|2.5\r" +
      "OBR|1||ORD001\r" +
      "OBX|1|ST|NOTE||line1\\.br\\line2\r";
    const out = parseHL7(raw).prettyPrint();
    const obxLine = out.split("\n").find((l) => l.startsWith("OBX"));
    expect(obxLine).toBeDefined();
    // `\.br\` literal (5 chars: \, ., b, r, \) should appear in the field
    // value. The separator between pretty-print lines is `\n` - so any
    // OTHER `\n` would corrupt the output.
    expect(obxLine).toContain("\\.br\\");
    // The raw-tree subcomponent holds literal `\n`, but emit re-escapes it
    // -> the rendered segment line must NOT contain a literal LF.
    expect(obxLine).not.toContain("\n");
  });

  it("all 5 active delimiters render as their escape forms", () => {
    // Hand-build a PID with PID-5 = a single subcomponent that contains
    // every delimiter char literal. After emitField re-escape, the output
    // must contain all 5 escape forms and NONE of the literal delimiter
    // chars inside the subcomponent.
    //   |  -> \F\
    //   ^  -> \S\
    //   ~  -> \R\
    //   \  -> \E\
    //   &  -> \T\
    const value = "|^~\\&";
    const pid: RawSegment = {
      name: "PID",
      fields: [
        { repetitions: [], isNull: false }, // fields[0] placeholder
        {
          repetitions: [{ components: [{ subcomponents: ["1"] }] }],
          isNull: false,
        }, // PID-1
        { repetitions: [], isNull: false }, // PID-2 absent
        { repetitions: [], isNull: false }, // PID-3 absent
        { repetitions: [], isNull: false }, // PID-4 absent
        {
          repetitions: [{ components: [{ subcomponents: [value] }] }],
          isNull: false,
        }, // PID-5 = all 5 delimiters
      ],
    };
    const msg = makeMsg([makeMshSegment(), pid]);
    const out = msg.prettyPrint();
    const pidLine = out.split("\n").find((l) => l.startsWith("PID"));
    expect(pidLine).toBeDefined();

    // Extract PID-5 value - everything after `[5]=` to EOL (PID-5 is the
    // last labeled field here).
    const match = /\[5\]=(.+)$/u.exec(pidLine ?? "");
    const pid5 = match?.[1] ?? "";

    // All 5 escape forms present (one assertion per delimiter).
    expect(pid5).toContain("\\F\\");
    expect(pid5).toContain("\\S\\");
    expect(pid5).toContain("\\R\\");
    expect(pid5).toContain("\\E\\");
    expect(pid5).toContain("\\T\\");
  });
});

// --- Block 5: Line structure ---------------------------------------------

describe("emitPrettyPrint - Block 5: line structure", () => {
  it("lines separated by '\\n' - total line count = rawSegments.length + 1", () => {
    const msg = parseHL7(CANONICAL_ADT);
    const out = msg.prettyPrint();
    expect(out.split("\n").length).toBe(msg.rawSegments.length + 1);
  });

  it("output does NOT end with a trailing newline", () => {
    const out = parseHL7(CANONICAL_ADT).prettyPrint();
    expect(out.endsWith("\n")).toBe(false);
  });

  it("output contains no '\\r' (LF only, not HL7 CR)", () => {
    const out = parseHL7(CANONICAL_ADT).prettyPrint();
    expect(out.includes("\r")).toBe(false);
  });
});

// --- Block 6: Purity (D-26) ----------------------------------------------

describe("emitPrettyPrint - Block 6: D-26 purity", () => {
  it("never throws on any parseable input (3 diverse fixtures)", () => {
    const canonical = parseHL7(CANONICAL_ADT);
    const mshOnly = parseHL7(MSH_ONLY);
    const minimal = parseHL7(MSH_MINIMAL);
    expect(() => canonical.prettyPrint()).not.toThrow();
    expect(() => mshOnly.prettyPrint()).not.toThrow();
    expect(() => minimal.prettyPrint()).not.toThrow();
  });

  it("deterministic - two back-to-back calls return identical strings", () => {
    const msg = parseHL7(CANONICAL_ADT);
    expect(msg.prettyPrint()).toBe(msg.prettyPrint());
  });

  it("does not mutate msg (rawSegments JSON snapshot stable)", () => {
    const msg = parseHL7(CANONICAL_ADT);
    const before = JSON.stringify(msg.rawSegments);
    msg.prettyPrint();
    const after = JSON.stringify(msg.rawSegments);
    expect(after).toBe(before);
  });

  it("MSH-only message prints header + MSH line (exactly 2 lines)", () => {
    const msg = parseHL7(MSH_ONLY);
    const out = msg.prettyPrint();
    const lines = out.split("\n");
    expect(msg.rawSegments.length).toBe(1);
    expect(lines.length).toBe(2);
    expect(lines[1]?.startsWith("MSH  ")).toBe(true);
    // At least one `[N]=` label must be present on the MSH line.
    expect(lines[1]).toMatch(/\[\d+\]=/u);
  });

  it("skips an undefined field slot (sparse fields array) without a label", () => {
    // A hand-built segment whose fields array has a hole at index 2 (PID-2).
    // buildSegmentLine must `continue` past the undefined slot, so no `[2]=`
    // label appears, but the populated PID-1 and PID-3 still render.
    const base = parseHL7(MSH_ONLY);
    const placeholder: RawField = { repetitions: [], isNull: false };
    const pidFields: RawField[] = [placeholder];
    pidFields[1] = { repetitions: [{ components: [{ subcomponents: ["1"] }] }], isNull: false };
    pidFields[3] = { repetitions: [{ components: [{ subcomponents: ["MRN9"] }] }], isNull: false };
    // index 2 (PID-2) is a hole -> undefined at runtime.
    const pid: RawSegment = { name: "PID", fields: pidFields };
    const msg = new Hl7Message({
      segments: [...base.rawSegments, pid],
      encodingCharacters: DEFAULT_ENCODING_CHARACTERS,
      version: "2.5",
      warnings: [],
    });
    const pidLine = msg.prettyPrint().split("\n").at(-1);
    expect(pidLine).toContain("[1]=1");
    expect(pidLine).toContain("[3]=MRN9");
    expect(pidLine).not.toContain("[2]=");
  });
});
