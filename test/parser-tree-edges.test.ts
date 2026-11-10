/**
 * The parsed tree at its edges, held exactly: a segment that ends at its last separator, the
 * escape overlay's length and positions, a warning's full position, and which MSH field a trim
 * marks. Each is a place where a tree built a different way could differ while every round trip
 * still passed. Every message here is synthetic.
 */

import { describe, expect, it } from "vitest";

import { parseHL7 } from "../src/index.js";
import { fieldArrivedAltered } from "../src/parser/wire-fidelity.js";

const MSH = "MSH|^~\\&|LAB|FAC|EHR|FAC|20260101120000||ORU^R01|C1|P|2.5";

describe("the parsed tree at its edges", () => {
  it("reads a segment that ends at its last separator as a segment with no data field", () => {
    const msg = parseHL7(`${MSH}\rPID|\rPV1||\rMSH|^~\\&|\rNTE`);
    expect(msg.rawSegments[1]?.fields).toHaveLength(1);
    expect(msg.rawSegments[2]?.fields).toHaveLength(3);
    expect(msg.rawSegments[3]?.fields).toHaveLength(2);
    expect(msg.rawSegments[4]?.fields).toHaveLength(1);
  });

  it("sizes the escape overlay to the component, with each entry at its own subcomponent", () => {
    const msg = parseHL7(`${MSH}\rNTE|1||\\H\\a&b&\\Z1\\c\r`, { strict: false });
    const comp = msg.rawSegments[1]?.fields[3]?.repetitions[0]?.components[0];
    expect(comp?.subcomponents).toEqual(["\\H\\a", "b", "\\Z1\\c"]);
    expect(comp?.rawSubcomponents).toStrictEqual(["\\H\\a", undefined, "\\Z1\\c"]);
    const first = parseHL7(`${MSH}\rNTE|1||\\H\\a&b`).rawSegments[1]?.fields[3]?.repetitions[0]
      ?.components[0];
    expect(first?.rawSubcomponents).toStrictEqual(["\\H\\a", undefined]);
  });

  it("records no overlay for a subcomponent with no escape, even one that re-escapes differently", () => {
    // With a declared truncation character, a literal `#` re-escapes to \P\; the overlay is only
    // ever for text that arrived with an escape in it, so this one has none.
    const msg = parseHL7("MSH|^~\\&#|LAB\rNTE|1||a#b&c");
    expect(msg.rawSegments[1]?.fields[3]?.repetitions[0]?.components[0]).toStrictEqual({
      subcomponents: ["a#b", "c"],
    });
  });

  it("gives an escape warning the full position of its subcomponent, every index from 1", () => {
    const msg = parseHL7(`${MSH}\rPID|1|x~y^a&b&\\Z9\\c`);
    const escapes = msg.warnings.filter((w) => w.code === "UNKNOWN_ESCAPE_SEQUENCE");
    expect(escapes.map((w) => w.position)).toEqual([
      {
        segmentIndex: 1,
        fieldIndex: 2,
        repetitionIndex: 2,
        componentIndex: 2,
        subcomponentIndex: 3,
      },
    ]);
    const mshWarning = parseHL7("MSH|^~\\&|A^\\Z1\\").warnings[0];
    expect(mshWarning?.position).toEqual({
      segmentIndex: 0,
      fieldIndex: 3,
      repetitionIndex: 1,
      componentIndex: 2,
      subcomponentIndex: 1,
    });
  });

  it("marks the MSH field a trim altered, numbered as HL7 numbers it", () => {
    const msg = parseHL7("MSH|^~\\&| LAB|FAC|EHR\rPID| 1|2");
    const [msh, pid] = msg.rawSegments;
    expect(msg.warnings.map((w) => w.position)).toEqual([
      { segmentIndex: 0, fieldIndex: 3 },
      { segmentIndex: 1, fieldIndex: 1 },
    ]);
    // MSH-3 is fields[2]: MSH-1 sits at fields[0].
    expect(msh?.fields.map((f) => fieldArrivedAltered(f))).toEqual([
      false,
      false,
      true,
      false,
      false,
    ]);
    expect(pid?.fields.map((f) => fieldArrivedAltered(f))).toEqual([false, true, false]);
  });
});
