import { describe, expect, it } from "vitest";

import { parseHL7 } from "../src/parser/index.js";
import { Field } from "../src/model/field.js";
import { Segment } from "../src/model/segment.js";
import { DEFAULT_ENCODING_CHARACTERS } from "../src/parser/delimiters.js";
import type { RawField } from "../src/parser/types.js";

describe("model/field: Field wrapper", () => {
  it("exposes isNull from RawField", () => {
    const raw: RawField = { repetitions: [], isNull: true };
    const f = new Field(raw, DEFAULT_ENCODING_CHARACTERS, { segmentIndex: 0 });
    expect(f.isNull).toBe(true);
  });

  it("exposes repetitions by reference (no defensive copy)", () => {
    const raw: RawField = {
      repetitions: [{ components: [{ subcomponents: ["A"] }] }],
      isNull: false,
    };
    const f = new Field(raw, DEFAULT_ENCODING_CHARACTERS, { segmentIndex: 0 });
    expect(f.repetitions).toBe(raw.repetitions);
    expect(f.repetitions).toHaveLength(1);
  });

  it("exposes raw RawField and enc for composite parsers (Plan 04 hook)", () => {
    const raw: RawField = { repetitions: [], isNull: false };
    const f = new Field(raw, DEFAULT_ENCODING_CHARACTERS, { segmentIndex: 0 });
    expect(f.raw).toBe(raw);
    expect(f.enc).toBe(DEFAULT_ENCODING_CHARACTERS);
  });

  it("value returns the first subcomponent of the first component of the first repetition", () => {
    const raw: RawField = {
      repetitions: [{ components: [{ subcomponents: ["Smith"] }] }],
      isNull: false,
    };
    const f = new Field(raw, DEFAULT_ENCODING_CHARACTERS, { segmentIndex: 0 });
    expect(f.value).toBe("Smith");
  });

  it("value auto-unescapes \\F\\ at the leaf", () => {
    const raw: RawField = {
      repetitions: [{ components: [{ subcomponents: ["Smith\\F\\Jr"] }] }],
      isNull: false,
    };
    const f = new Field(raw, DEFAULT_ENCODING_CHARACTERS, { segmentIndex: 0 });
    expect(f.value).toBe("Smith|Jr");
  });

  it("value returns '' for an empty field (no repetitions)", () => {
    const raw: RawField = { repetitions: [], isNull: false };
    const f = new Field(raw, DEFAULT_ENCODING_CHARACTERS, { segmentIndex: 0 });
    expect(f.value).toBe("");
  });

  it("value returns '' for an HL7 null field (isNull=true, empty repetitions)", () => {
    const raw: RawField = { repetitions: [], isNull: true };
    const f = new Field(raw, DEFAULT_ENCODING_CHARACTERS, { segmentIndex: 0 });
    // Per §Specifics §Field wrapper isNull surfacing: value surfaces as "".
    // The distinction is preserved on f.isNull only.
    expect(f.value).toBe("");
    expect(f.isNull).toBe(true);
  });

  it("Field.empty returns a stable sentinel (same instance on repeat calls)", () => {
    const a = Field.empty(DEFAULT_ENCODING_CHARACTERS);
    const b = Field.empty(DEFAULT_ENCODING_CHARACTERS);
    expect(a).toBe(b);
  });

  it("Field.empty has value='' and isNull=false and empty repetitions", () => {
    const empty = Field.empty(DEFAULT_ENCODING_CHARACTERS);
    expect(empty.value).toBe("");
    expect(empty.isNull).toBe(false);
    expect(empty.repetitions).toHaveLength(0);
  });

  it("integrates with parseHL7 — PID-5 first-subcomponent via Segment.field(5)", () => {
    const msg = parseHL7(
      "MSH|^~\\&|A|F|A|F|20250101||ADT^A01|1|P|2.5\rPID|||1|A|Smith\\F\\Jr^Jane",
    );
    const pid = msg.segments[1];
    if (pid === undefined) throw new Error("no PID");
    // Build a Segment manually since Hl7Message.segments(type) lands in Task 3.
    const seg = new Segment(pid, msg.encodingCharacters, 1);
    const f5 = seg.field(5);
    expect(f5.value).toBe("Smith|Jr");
    expect(f5.isNull).toBe(false);
  });
});
