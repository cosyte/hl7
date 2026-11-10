/**
 * setField and setComposite on a message built by hand whose fields,
 * repetitions or components array has a hole in it. The read side already
 * treats a hole as empty (`get` resolves it to undefined); the write side
 * treated it as a broken internal invariant and threw. A hole reads as empty
 * on both sides now.
 *
 * All values are synthetic.
 */

import { describe, expect, it } from "vitest";

import {
  DEFAULT_ENCODING_CHARACTERS,
  Hl7Message,
  parseHL7,
  type RawField,
  type RawSegment,
} from "../src/index.js";

const MSH_RAW: RawSegment = parseHL7("MSH|^~\\&|A|B|C|D|20260101||ADT^A01|MSG1|P|2.5")
  .rawSegments[0] as RawSegment;

const field = (value: string): RawField => ({
  repetitions: [{ components: [{ subcomponents: [value] }] }],
  isNull: false,
});

const byHand = (segments: readonly RawSegment[]): Hl7Message =>
  new Hl7Message({
    segments,
    encodingCharacters: DEFAULT_ENCODING_CHARACTERS,
    version: "2.5",
    warnings: [],
  });

/** An array of `length` with only the given indices set: the rest are holes. */
function sparse<T>(length: number, entries: Readonly<Record<number, T>>): T[] {
  const out: T[] = [];
  out.length = length;
  for (const [index, value] of Object.entries(entries)) out[Number(index)] = value;
  return out;
}

describe("a message built by hand with a hole inside a segment", () => {
  it("setField treats a hole in the fields as an empty field", () => {
    const msg = byHand([
      MSH_RAW,
      { name: "PID", fields: sparse<RawField>(4, { 0: field(""), 3: field("MRN1") }) },
    ]);
    msg.setField("PID.2", "X");
    expect(msg.get("PID.2")).toBe("X");
    expect(msg.get("PID.3")).toBe("MRN1");
  });

  it("setField treats a hole in the repetitions as an empty repetition", () => {
    const reps: RawField = {
      repetitions: sparse(2, { 1: { components: [{ subcomponents: ["B"] }] } }),
      isNull: false,
    };
    const msg = byHand([
      MSH_RAW,
      { name: "PID", fields: [field(""), field("1"), field(""), reps] },
    ]);
    msg.setField("PID.3[0].1", "A");
    expect(msg.get("PID.3[0]")).toBe("A");
    expect(msg.get("PID.3[1]")).toBe("B");
  });

  it("setField treats a hole in the components as an empty component", () => {
    const comps: RawField = {
      repetitions: [{ components: sparse(2, { 1: { subcomponents: ["John"] } }) }],
      isNull: false,
    };
    const msg = byHand([
      MSH_RAW,
      { name: "PID", fields: [field(""), field("1"), field(""), field(""), field(""), comps] },
    ]);
    msg.setField("PID.5.1", "Doe");
    expect(msg.get("PID.5.1")).toBe("Doe");
    expect(msg.get("PID.5.2")).toBe("John");
  });

  it("setComposite treats a hole in the fields as an empty field", () => {
    const msg = byHand([
      MSH_RAW,
      { name: "PID", fields: sparse<RawField>(6, { 0: field(""), 1: field("1") }) },
    ]);
    msg.setComposite("PID.5", "XPN", { familyName: "Doe" });
    expect(msg.get("PID.5.1")).toBe("Doe");
  });

  it("setComposite treats a hole in the repetitions as an empty repetition", () => {
    const reps: RawField = {
      repetitions: sparse(2, { 1: { components: [{ subcomponents: ["Second"] }] } }),
      isNull: false,
    };
    const msg = byHand([
      MSH_RAW,
      { name: "PID", fields: [field(""), field("1"), field(""), field(""), field(""), reps] },
    ]);
    msg.setComposite("PID.5[0]", "XPN", { familyName: "Doe" });
    expect(msg.get("PID.5[0].1")).toBe("Doe");
    expect(msg.get("PID.5[1].1")).toBe("Second");
  });

  it("a hole elsewhere in the segment still serializes as an empty position", () => {
    const msg = byHand([
      MSH_RAW,
      { name: "PID", fields: sparse<RawField>(4, { 0: field(""), 3: field("MRN1") }) },
    ]);
    msg.setField("PID.4", "X");
    expect(msg.toString().split("\r")[1]).toBe("PID|||MRN1|X");
  });
});
