/**
 * Edge cases of the message model the main suites do not reach: dot-path
 * syntax errors, reads past what a field carries, mutation of a later
 * occurrence, and a message built by hand with holes in its arrays.
 *
 * Every case asserts what a consumer reads back. All values are synthetic.
 */

import { describe, expect, it } from "vitest";

import {
  DEFAULT_ENCODING_CHARACTERS,
  Hl7Message,
  parseHL7,
  parsePath,
  resolvePath,
  type RawField,
  type RawSegment,
} from "../src/index.js";

const MSH = "MSH|^~\\&|A|B|C|D|20260101||ADT^A01|MSG1|P|2.5";

const message = (...segments: readonly string[]): Hl7Message =>
  parseHL7([MSH, ...segments].join("\r"));

/** The parsed MSH of {@link MSH}, for messages built by hand. */
const MSH_RAW: RawSegment = message().rawSegments[0] as RawSegment;

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

describe("parsePath syntax errors", () => {
  for (const [path, reason] of [
    ["PI", "segment name too short"],
    ["PID.5X", "unexpected 'X' at position 5"],
    ["PID.5.", "trailing dot"],
    ["PID.5.1X", "unexpected 'X' at position 7"],
    ["PID.5.1.", "trailing dot"],
    ["PID[0", "unclosed '[' at position 3"],
  ] as const) {
    it(`refuses "${path}": ${reason}`, () => {
      expect(() => parsePath(path)).toThrow(
        new TypeError(`Invalid HL7 dot-path: "${path}" (${reason}).`),
      );
    });
  }

  it("accepts a segment-only path, which resolves to no value", () => {
    expect(parsePath("PID")).toEqual({ segmentType: "PID", segmentIndex: 0, fieldIndex: 0 });
    expect(message("PID|1").get("PID")).toBeUndefined();
  });
});

describe("reads past what a field carries", () => {
  it("a subcomponent past the last one resolves to undefined", () => {
    const msg = message("PID|1||||Doe^John");
    expect(msg.get("PID.5.1.1")).toBe("Doe");
    expect(msg.get("PID.5.1.2")).toBeUndefined();
  });

  it("resolvePath skips a hole in the segment list", () => {
    const segments = sparse<RawSegment>(3, {
      0: MSH_RAW,
      2: { name: "PID", fields: [field(""), field("1")] },
    });
    expect(resolvePath("PID.1", segments, DEFAULT_ENCODING_CHARACTERS)).toBe("1");
  });

  it("Field.value is empty for a repetition or component a mutation left empty", () => {
    const msg = message("PID|1");
    msg.setField("PID.5[1].1", "Second");
    msg.setField("PID.6.2", "Given");
    const pid = msg.segments("PID")[0];
    expect(pid?.field(5).repetitions).toHaveLength(2);
    expect(pid?.field(5).value).toBe("");
    expect(pid?.field(6).value).toBe("");
    expect(msg.get("PID.6.2")).toBe("Given");
  });

  it("asSn on an empty field is undefined", () => {
    expect(message("OBX|1|SN|X^Y^LN").segments("OBX")[0]?.field(5).asSn()).toBeUndefined();
  });
});

describe("an HD assigning authority past its three components", () => {
  it("is absent on CX, PL and XCN when only a fourth subcomponent carries content", () => {
    const msg = message("PID|1||MRN1^^^&&&X", "PV1|1|I|ICU^1^A^&&&X|||||123^Doe^^^^^^^&&&X");
    expect(msg.segments("PID")[0]?.field(3).asCx().assigningAuthority).toBeUndefined();
    expect(msg.segments("PV1")[0]?.field(3).asPl().facility).toBeUndefined();
    expect(msg.segments("PV1")[0]?.field(8).asXcn().assigningAuthority).toBeUndefined();
  });
});

describe("mutation", () => {
  it("setField writes the occurrence it names, not the first", () => {
    const msg = message("OBX|1|ST|A||one", "OBX|2|ST|B||two");
    msg.setField("OBX[1].5", "changed");
    expect(msg.get("OBX.5")).toBe("one");
    expect(msg.get("OBX[1].5")).toBe("changed");
  });

  it("setField grows a segment to reach a field past its last", () => {
    const msg = message("PID|1");
    msg.setField("PID.30", "Y");
    expect(msg.get("PID.30")).toBe("Y");
    expect(msg.toString().split("\r")[1]).toBe(`PID|1${"|".repeat(29)}Y`);
  });

  it("setComposite writes the occurrence it names, not the first", () => {
    const msg = message("OBX|1|CWE|A||X1", "OBX|2|CWE|B||X2");
    msg.setComposite("OBX[1].5", "CWE", { identifier: "Y2", text: "Changed" });
    expect(msg.get("OBX.5")).toBe("X1");
    expect(msg.get("OBX[1].5.2")).toBe("Changed");
  });

  it("setComposite with an all-empty composite clears the field", () => {
    const msg = message("PID|1||||Doe^John");
    msg.setComposite("PID.5", "XPN", {});
    expect(msg.get("PID.5")).toBeUndefined();
  });

  it("setComposite on MSH uses the MSH field numbering", () => {
    const msg = message();
    msg.setComposite("MSH.4", "HD", { namespaceId: "FAC2" });
    expect(msg.get("MSH.4")).toBe("FAC2");
    expect(msg.meta.sendingFacility).toBe("FAC2");
  });
});

describe("a message built by hand with a hole in its segment list", () => {
  const withHole = (): Hl7Message =>
    byHand(
      sparse<RawSegment>(3, { 0: MSH_RAW, 2: { name: "NTE", fields: [field(""), field("1")] } }),
    );

  it("allSegments skips the hole", () => {
    expect(
      withHole()
        .allSegments()
        .map((s) => s.type),
    ).toEqual(["MSH", "NTE"]);
  });

  it("setField and setComposite find the segment past the hole", () => {
    const msg = withHole();
    msg.setField("NTE.3", "note");
    msg.setComposite("NTE.4", "CWE", { identifier: "RE" });
    expect(msg.get("NTE.3")).toBe("note");
    expect(msg.get("NTE.4")).toBe("RE");
  });

  it("removeSegment finds the segment past the hole", () => {
    const msg = withHole();
    msg.removeSegment("NTE");
    expect(msg.segments("NTE")).toEqual([]);
  });
});
