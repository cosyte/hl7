/**
 * The parser shares one frozen node among every empty field (`||`), one among every explicit null
 * (`|""|`), and one `fields[0]` placeholder among the segments of one name, to keep a parsed
 * message small. A shared node must never carry what is true of one field only: the parser marks a
 * field it altered on the way in (a VT or FS byte removed from inside it), and a field that was
 * empty only once that byte was gone must get a node of its own, or every empty field anywhere
 * would read as altered. Every message here is synthetic.
 */

import { describe, expect, it } from "vitest";

import { parseHL7 } from "../src/index.js";
import { fieldArrivedAltered } from "../src/parser/wire-fidelity.js";

const VT = "\u000B";
const FS = "\u001C";

const MSH = "MSH|^~\\&|LAB|FAC|EHR|FAC|20260101120000||ORU^R01|C1|P|2.5";

describe("shared empty and null field nodes", () => {
  it("gives every empty field one frozen node, and every explicit null another", () => {
    const msg = parseHL7(`${MSH}\rPID|1||X||""|""||\rOBX|1||||""`);
    const pid = msg.rawSegments[1]?.fields ?? [];
    const obx = msg.rawSegments[2]?.fields ?? [];
    const empty = pid[2];
    const nil = pid[5];
    expect(empty).toEqual({ repetitions: [], isNull: false });
    expect(nil).toEqual({ repetitions: [], isNull: true });
    expect(Object.isFrozen(empty)).toBe(true);
    expect(Object.isFrozen(empty?.repetitions)).toBe(true);
    expect(Object.isFrozen(nil)).toBe(true);
    expect(pid[4]).toBe(empty);
    expect(pid[7]).toBe(empty);
    expect(obx[2]).toBe(empty);
    expect(pid[6]).toBe(nil);
    expect(obx[5]).toBe(nil);
    // A field with content is its own node, and its arrays can be read as before.
    expect(pid[3]).not.toBe(pid[1]);
    expect(Object.isFrozen(pid[3])).toBe(false);
  });

  it("gives an empty field that lost a VT byte a node of its own, and marks only that one", () => {
    const msg = parseHL7(`${VT}${MSH}\rPID|1||${VT}||X||\r${FS}\r`);
    const pid = msg.rawSegments[1]?.fields ?? [];
    const altered = pid[3];
    expect(altered).toEqual({ repetitions: [], isNull: false });
    expect(altered && fieldArrivedAltered(altered)).toBe(true);
    expect(Object.isFrozen(altered)).toBe(false);
    expect(pid[2]).not.toBe(altered);
    expect(pid[2] && fieldArrivedAltered(pid[2])).toBe(false);
    expect(pid[6] && fieldArrivedAltered(pid[6])).toBe(false);
    // Nor does it leak into the next message's empty fields.
    const next = parseHL7(`${MSH}\rPID|1||`).rawSegments[1]?.fields[2];
    expect(next && fieldArrivedAltered(next)).toBe(false);
  });

  it("gives an explicit null that lost an FS byte a node of its own, and marks only that one", () => {
    const msg = parseHL7(`${VT}${MSH}\rPID|1|"${FS}"|""\r${FS}\r`);
    const pid = msg.rawSegments[1]?.fields ?? [];
    const altered = pid[2];
    expect(altered).toEqual({ repetitions: [], isNull: true });
    expect(altered && fieldArrivedAltered(altered)).toBe(true);
    expect(pid[3]).not.toBe(altered);
    expect(pid[3] && fieldArrivedAltered(pid[3])).toBe(false);
  });

  it("gives every segment of one name one frozen placeholder, and MSH-1 one of its own", () => {
    const msg = parseHL7(`${MSH}\rOBX|1|NM\rOBX|2|NM\rNTE|1\rMSH|^~\\&|B\rOBX|3`);
    const [msh, obx1, obx2, nte, msh2, obx3] = msg.rawSegments;
    const shared = obx1?.fields[0];
    expect(shared).toEqual({
      repetitions: [{ components: [{ subcomponents: ["OBX"] }] }],
      isNull: false,
    });
    expect(obx2?.fields[0]).toBe(shared);
    expect(obx3?.fields[0]).toBe(shared);
    expect(nte?.fields[0]).not.toBe(shared);
    expect(nte?.fields[0]?.repetitions[0]?.components[0]?.subcomponents).toEqual(["NTE"]);
    expect(msh2?.fields[0]).toBe(msh?.fields[0]);
    expect(msh?.fields[0]?.repetitions[0]?.components[0]?.subcomponents).toEqual(["|"]);
    // MSH-2 holds each header's own encoding characters.
    expect(msh2?.fields[1]).not.toBe(msh?.fields[1]);
    expect(msh2?.fields[1]).toEqual(msh?.fields[1]);
    const rep = shared?.repetitions[0];
    const comp = rep?.components[0];
    for (const node of [
      shared,
      shared?.repetitions,
      rep,
      rep?.components,
      comp,
      comp?.subcomponents,
    ]) {
      expect(Object.isFrozen(node)).toBe(true);
    }
    // A data field is the segment's own, and so is its fields array.
    expect(obx2?.fields[1]).not.toBe(obx1?.fields[1]);
    expect(Object.isFrozen(obx1?.fields)).toBe(false);
  });

  it("reads a later segment that is MSH alone as MSH-1 and an empty MSH-2", () => {
    const msg = parseHL7(`${MSH}\rMSH\rPID|1`);
    expect(msg.rawSegments[1]).toEqual({
      name: "MSH",
      fields: [
        { repetitions: [{ components: [{ subcomponents: ["|"] }] }], isNull: false },
        { repetitions: [{ components: [{ subcomponents: [""] }] }], isNull: false },
      ],
    });
  });

  it("gives a placeholder whose segment lost a VT byte from its name a node of its own", () => {
    const msg = parseHL7(`${VT}${MSH}\rOBX|1\rOB${VT}X|2\rOBX|3\r${FS}\r`);
    const [, obx1, obx2, obx3] = msg.rawSegments;
    const altered = obx2?.fields[0];
    expect(altered).toEqual(obx1?.fields[0]);
    expect(altered && fieldArrivedAltered(altered)).toBe(true);
    expect(obx1?.fields[0] && fieldArrivedAltered(obx1.fields[0])).toBe(false);
    expect(obx3?.fields[0]).toBe(obx1?.fields[0]);
  });

  it("marks nothing when a removed byte stood alone between two segment breaks", () => {
    const msg = parseHL7(`${VT}${MSH}\rPID|1||\r${VT}\rOBX|1||\r${FS}\r`);
    expect(msg.rawSegments[2]).toEqual({ name: "", fields: [] });
    for (const segment of msg.rawSegments) {
      for (const field of segment.fields) expect(fieldArrivedAltered(field)).toBe(false);
    }
  });
});
