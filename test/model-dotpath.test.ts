import { describe, expect, it } from "vitest";

import { parseHL7 } from "../src/parser/index.js";
import { parsePath, resolvePath } from "../src/model/dot-path.js";

// NOTE: Task 3 renames the public raw-tree field `msg.segments` → `msg.rawSegments`
// when the `segments(type)` method lands. These tests consume the raw tree at
// Task 1 time; Task 3 will migrate the field name.

// PID-5: Smith\F\Jr^Jane^Q^Jr.^Mrs. — escaped `|` in the family name exercises auto-unescape.
// PID-3: 123456^^^MRN — single rep, 4 components (tests component indexing and gaps).
// Added PID-3 repetition variant for rep-index tests: "100~200^^^MRN" parses as PID-3 with
// two repetitions: rep[0]={100}, rep[1]={200,,,MRN}.
const FIXTURE =
  "MSH|^~\\&|APP|FAC|APP|FAC|20250101||ADT^A01|1|P|2.5\r" +
  "PID|||100~200^^^MRN||Smith\\F\\Jr^Jane^Q^Jr.^Mrs.|||F\r" +
  "OBX|1|TX|GLUC|1|120|mg/dL|80-110||||F\r" +
  "OBX|2|TX|HGB|2|14.0|g/dL|12-16||||F\r" +
  "OBX|3|TX|PLT|3|200|K/uL|150-400||||F";

describe("model/dot-path: parsePath", () => {
  it("parses a simple component path", () => {
    const dp = parsePath("PID.5.1");
    expect(dp.segmentType).toBe("PID");
    expect(dp.segmentIndex).toBe(0);
    expect(dp.fieldIndex).toBe(5);
    expect(dp.componentIndex).toBe(1);
  });

  it("parses a path with explicit segment occurrence", () => {
    const dp = parsePath("OBX[2].5");
    expect(dp.segmentType).toBe("OBX");
    expect(dp.segmentIndex).toBe(2);
    expect(dp.fieldIndex).toBe(5);
  });

  it("parses a path with field repetition index", () => {
    const dp = parsePath("PID.3[1].1");
    expect(dp.segmentType).toBe("PID");
    expect(dp.fieldIndex).toBe(3);
    expect(dp.repetitionIndex).toBe(1);
    expect(dp.componentIndex).toBe(1);
  });

  it("parses a Z-segment name", () => {
    const dp = parsePath("ZPI.3");
    expect(dp.segmentType).toBe("ZPI");
    expect(dp.fieldIndex).toBe(3);
  });

  it("parses subcomponent depth", () => {
    const dp = parsePath("PID.5.1.1");
    expect(dp.subcomponentIndex).toBe(1);
  });
});

describe("model/dot-path: parsePath rejects malformed paths", () => {
  it.each([
    [""],
    ["pid.5"], // lowercase
    ["PI.5"], // 2 chars
    ["PIDX.5"], // 4 chars
    ["1PID.5"], // starts with digit
    ["PID."], // trailing dot
    [".PID.5"], // leading dot
    ["PID.5.1.1.1"], // too deep
    ["PID.-1"], // negative field
    ["PID[-1].5"], // negative segment rep
    ["PID.5[]"], // empty bracket
    ["PID.5[a]"], // non-digit bracket
  ])("throws TypeError on %s", (badPath) => {
    expect(() => parsePath(badPath)).toThrow(TypeError);
  });
});

describe("model/dot-path: resolvePath — acceptance paths", () => {
  it("resolves PID.5.1 to the component string (auto-unescaped)", () => {
    const msg = parseHL7(FIXTURE);
    expect(resolvePath("PID.5.1", msg.segments, msg.encodingCharacters)).toBe("Smith|Jr");
  });

  it("resolves PID.5 to the first subcomponent of the first component", () => {
    const msg = parseHL7(FIXTURE);
    expect(resolvePath("PID.5", msg.segments, msg.encodingCharacters)).toBe("Smith|Jr");
  });

  it("resolves OBX[2].5 to the third OBX segment's 5th field (0-indexed)", () => {
    const msg = parseHL7(FIXTURE);
    // Third OBX is `OBX|3|TX|PLT|3|200|...` — OBX-5 = "200".
    expect(resolvePath("OBX[2].5", msg.segments, msg.encodingCharacters)).toBe("200");
  });

  it("resolves OBX[0].5 to the FIRST OBX segment's 5th field", () => {
    const msg = parseHL7(FIXTURE);
    // First OBX is `OBX|1|TX|GLUC|1|120|...` — OBX-5 = "120".
    expect(resolvePath("OBX[0].5", msg.segments, msg.encodingCharacters)).toBe("120");
  });

  it("resolves PID.3[0].1 to component 1 of the first repetition", () => {
    const msg = parseHL7(FIXTURE);
    expect(resolvePath("PID.3[0].1", msg.segments, msg.encodingCharacters)).toBe("100");
  });

  it("resolves PID.3[1].1 to component 1 of the second repetition", () => {
    const msg = parseHL7(FIXTURE);
    expect(resolvePath("PID.3[1].1", msg.segments, msg.encodingCharacters)).toBe("200");
  });

  it("resolves PID.3 (omitted [N]) to the FIRST repetition's first subcomponent", () => {
    const msg = parseHL7(FIXTURE);
    expect(resolvePath("PID.3", msg.segments, msg.encodingCharacters)).toBe("100");
  });

  it("collapses depth on PID.5.1.1 (no `&` subcomponents — returns component string, D-04)", () => {
    const msg = parseHL7(FIXTURE);
    expect(resolvePath("PID.5.1.1", msg.segments, msg.encodingCharacters)).toBe("Smith|Jr");
  });

  it("resolves MSH.1 to the field separator character `|`", () => {
    const msg = parseHL7(FIXTURE);
    expect(resolvePath("MSH.1", msg.segments, msg.encodingCharacters)).toBe("|");
  });

  it("resolves MSH.2 to the encoding-characters string `^~\\&`", () => {
    const msg = parseHL7(FIXTURE);
    expect(resolvePath("MSH.2", msg.segments, msg.encodingCharacters)).toBe("^~\\&");
  });

  it("resolves MSH.12 to the HL7 version string", () => {
    const msg = parseHL7(FIXTURE);
    expect(resolvePath("MSH.12", msg.segments, msg.encodingCharacters)).toBe("2.5");
  });

  it("returns undefined for a missing segment (MODEL-05)", () => {
    const msg = parseHL7(FIXTURE);
    expect(resolvePath("NOT.9.9", msg.segments, msg.encodingCharacters)).toBeUndefined();
  });

  it("returns undefined for an out-of-range field", () => {
    const msg = parseHL7(FIXTURE);
    expect(resolvePath("PID.99", msg.segments, msg.encodingCharacters)).toBeUndefined();
  });

  it("returns undefined for an out-of-range component", () => {
    const msg = parseHL7(FIXTURE);
    expect(resolvePath("PID.5.99", msg.segments, msg.encodingCharacters)).toBeUndefined();
  });

  it("returns undefined for an out-of-range segment occurrence", () => {
    const msg = parseHL7(FIXTURE);
    expect(resolvePath("OBX[5].5", msg.segments, msg.encodingCharacters)).toBeUndefined();
  });

  it("returns undefined for an out-of-range repetition", () => {
    const msg = parseHL7(FIXTURE);
    expect(resolvePath("PID.3[5].1", msg.segments, msg.encodingCharacters)).toBeUndefined();
  });

  it("auto-unescapes at the leaf (D-03)", () => {
    const msg = parseHL7(FIXTURE);
    // PID-5-1 raw is "Smith\F\Jr" — after unescape becomes "Smith|Jr".
    expect(resolvePath("PID.5.1", msg.segments, msg.encodingCharacters)).toBe("Smith|Jr");
  });

  it("returns `|` verbatim for MSH.1 even though unescape is called", () => {
    const msg = parseHL7(FIXTURE);
    // unescape passes `|` through (no escape char → no transformation).
    expect(resolvePath("MSH.1", msg.segments, msg.encodingCharacters)).toBe("|");
  });

  it("resolves PID.5.2 to the second component (Jane)", () => {
    const msg = parseHL7(FIXTURE);
    expect(resolvePath("PID.5.2", msg.segments, msg.encodingCharacters)).toBe("Jane");
  });

  it("resolves PID.3[1].4 to the 4th component of PID-3 rep[1] (MRN)", () => {
    const msg = parseHL7(FIXTURE);
    expect(resolvePath("PID.3[1].4", msg.segments, msg.encodingCharacters)).toBe("MRN");
  });

  it("resolves PID.8 (gender field)", () => {
    const msg = parseHL7(FIXTURE);
    expect(resolvePath("PID.8", msg.segments, msg.encodingCharacters)).toBe("F");
  });
});

describe("model/dot-path: parsePath shape-only (not referentially stable)", () => {
  it("returns fresh DotPath objects on repeat calls (no memoization required)", () => {
    const a = parsePath("PID.5");
    const b = parsePath("PID.5");
    expect(a).toEqual(b);
    // shape equal, identity not required
  });
});
