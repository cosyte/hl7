import { describe, expect, it } from "vitest";

import { parseHL7 } from "../src/parser/index.js";
import { Segment } from "../src/model/segment.js";
import { Field } from "../src/model/field.js";
import { DEFAULT_ENCODING_CHARACTERS } from "../src/parser/delimiters.js";
import type { RawSegment } from "../src/parser/types.js";

const FIXTURE =
  "MSH|^~\\&|APP|FAC|APP|FAC|20250101||ADT^A01|1|P|2.5\r" +
  "PID|||123|ALT|Smith\\F\\Jr^Jane\r" +
  "OBX|1|TX|GLUC|1|120";

describe("model/segment: Segment wrapper", () => {
  it("wraps a RawSegment without copying .fields (reference equality)", () => {
    const raw: RawSegment = {
      name: "PID",
      fields: [
        { repetitions: [], isNull: false },
        { repetitions: [], isNull: false },
      ],
    };
    const seg = new Segment(raw, DEFAULT_ENCODING_CHARACTERS, 1);
    expect(seg.type).toBe("PID");
    expect(seg.fields).toBe(raw.fields);
    expect(seg.raw).toBe(raw);
    expect(seg.absoluteIndex).toBe(1);
  });

  it("exposes seg.type equal to raw.name", () => {
    const msg = parseHL7(FIXTURE);
    const rawPid = msg.segments[1];
    if (rawPid === undefined) throw new Error("no PID");
    const seg = new Segment(rawPid, msg.encodingCharacters, 1);
    expect(seg.type).toBe("PID");
  });

  it("caches Field wrappers by position — seg.field(3) === seg.field(3) (D-12)", () => {
    const msg = parseHL7(FIXTURE);
    const rawPid = msg.segments[1];
    if (rawPid === undefined) throw new Error("no PID");
    const seg = new Segment(rawPid, msg.encodingCharacters, 1);
    const f1 = seg.field(3);
    const f2 = seg.field(3);
    expect(f1).toBe(f2);
    expect(f1).toBeInstanceOf(Field);
  });

  it("returns a Field wrapping fields[0] (the name placeholder) when asked", () => {
    const msg = parseHL7(FIXTURE);
    const rawPid = msg.segments[1];
    if (rawPid === undefined) throw new Error("no PID");
    const seg = new Segment(rawPid, msg.encodingCharacters, 1);
    const f0 = seg.field(0);
    expect(f0).toBeInstanceOf(Field);
    // fields[0] is the segment-name slot — subcomponent[0] is "PID".
    expect(f0.value).toBe("PID");
  });

  it("returns a synthetic empty Field for out-of-range positions (MODEL-05)", () => {
    const msg = parseHL7(FIXTURE);
    const rawPid = msg.segments[1];
    if (rawPid === undefined) throw new Error("no PID");
    const seg = new Segment(rawPid, msg.encodingCharacters, 1);
    const f = seg.field(99);
    expect(f.isNull).toBe(false);
    expect(f.repetitions).toHaveLength(0);
    expect(f.value).toBe("");
  });

  it("returns the same synthetic empty Field instance for repeat out-of-range calls", () => {
    const msg = parseHL7(FIXTURE);
    const rawPid = msg.segments[1];
    if (rawPid === undefined) throw new Error("no PID");
    const seg = new Segment(rawPid, msg.encodingCharacters, 1);
    expect(seg.field(99)).toBe(seg.field(99));
  });

  it("resolves real PID field values via the wrapper (integration)", () => {
    const msg = parseHL7(FIXTURE);
    const rawPid = msg.segments[1];
    if (rawPid === undefined) throw new Error("no PID");
    const seg = new Segment(rawPid, msg.encodingCharacters, 1);
    // PID.5 = Smith\F\Jr^Jane — first subcomponent auto-unescaped.
    expect(seg.field(5).value).toBe("Smith|Jr");
  });
});
