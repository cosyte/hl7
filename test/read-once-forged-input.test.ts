/**
 * Input a JavaScript caller can build that answers differently each time it is
 * read: an accessor element in a hand-built segments array, a getter on a
 * builder init member, a Segment wrapped in a Proxy by a subclass, and a
 * warning an `onWarning` callback changes after the parser hands it out. The
 * library reads each such value once and acts on that one answer, so the
 * second answer cannot change the outcome.
 *
 * Each case asserts what a consumer reads back. All values are synthetic.
 */

import { describe, expect, it } from "vitest";

import {
  DEFAULT_ENCODING_CHARACTERS,
  Hl7Message,
  WARNING_CODES,
  buildAdt,
  buildOru,
  parseHL7,
  type Hl7ParseWarning,
  type RawSegment,
  type Segment,
} from "../src/index.js";

import { ENVELOPE } from "./_helpers/supported-pairs.js";

/** A property descriptor whose getter answers `first` on the first read and `later` after. */
function changesAfterFirstRead<T>(first: T, later: unknown): PropertyDescriptor {
  let reads = 0;
  return {
    get: () => (reads++ === 0 ? first : later),
    enumerable: true,
    configurable: true,
  };
}

describe("a FIELD_WHITESPACE_TRIMMED warning changed by an onWarning callback", () => {
  const MSH = "MSH|^~\\&|APP|FAC|||20250102||ORU^R01|1|P|2.5";
  const OBR = "OBR|1|PLACER1|FILLER1|GLU^Test^L";
  // OBX-11 is " F": the parser trims it to "F", which no longer is what the sender wrote.
  const OBX = "OBX|1|ST|GLU^Test^L||text|||||| F";
  const RAW = [MSH, "PID|||X", OBR, OBX].join("\r");

  type Mutable = { code: string; position: { segmentIndex: number; fieldIndex?: number } };

  const statusAfter = (change: (w: Mutable) => void): string | undefined =>
    parseHL7(RAW, {
      onWarning: (w: Hl7ParseWarning) => {
        if (w.code === WARNING_CODES.FIELD_WHITESPACE_TRIMMED) change(w);
      },
    }).observations()[0]?.resultStatus.classification;

  it("reads the trimmed OBX-11 as undetermined with no callback", () => {
    expect(parseHL7(RAW).observations()[0]?.resultStatus.classification).toBe("undetermined");
  });

  it("still reads it as undetermined when the callback moves the warning to another segment", () => {
    expect(
      statusAfter((w) => {
        w.position.segmentIndex = 99;
      }),
    ).toBe("undetermined");
  });

  it("still reads it as undetermined when the callback deletes the warning's field index", () => {
    expect(
      statusAfter((w) => {
        delete w.position.fieldIndex;
      }),
    ).toBe("undetermined");
  });

  it("still reads it as undetermined when the callback replaces the warning's position", () => {
    expect(
      statusAfter((w) => {
        w.position = { segmentIndex: 0, fieldIndex: 3 };
      }),
    ).toBe("undetermined");
  });
});

describe("setField and setComposite on a segments array with an accessor element", () => {
  const parsed = parseHL7("MSH|^~\\&|A|B|C|D|20260101||ADT^A01|MSG1|P|2.5\rPID|1||MRN1");
  const [msh, pid] = parsed.rawSegments as readonly [RawSegment, RawSegment];

  /** A message whose PID element answers the PID once, then undefined. */
  const forged = (): Hl7Message => {
    const segments: RawSegment[] = [msh];
    Object.defineProperty(segments, 1, changesAfterFirstRead(pid, undefined));
    return new Hl7Message({
      segments,
      encodingCharacters: DEFAULT_ENCODING_CHARACTERS,
      version: "2.5",
      warnings: [],
    });
  };

  it("setField writes to the segment its lookup found", () => {
    const msg = forged().setField("PID.5", "X");
    expect(msg.get("PID.5")).toBe("X");
    expect(msg.get("PID.3")).toBe("MRN1");
  });

  it("setComposite writes to the segment its lookup found", () => {
    const msg = forged().setComposite("PID.5", "XPN", { familyName: "X" });
    expect(msg.get("PID.5.1")).toBe("X");
    expect(msg.get("PID.3")).toBe("MRN1");
  });
});

describe("a builder init member whose getter answers once", () => {
  /** A patient whose identifiers answer one CX, then undefined. */
  const patient = (): object => {
    const p = { name: { familyName: "Test" } };
    Object.defineProperty(
      p,
      "identifiers",
      changesAfterFirstRead([{ idNumber: "MRN1" }], undefined),
    );
    return p;
  };

  it("buildAdt writes PID-3 from the identifiers it read", () => {
    const msg = buildAdt("A04", {
      ...ENVELOPE,
      event: { recordedDateTime: "20260801101500" },
      patient: patient(),
    });
    expect(msg.get("PID.3")).toBe("MRN1");
    expect(msg.get("PID.5")).toBe("Test");
  });

  it("buildOru writes PID-3 from the identifiers it read", () => {
    const msg = buildOru({
      ...ENVELOPE,
      patient: patient(),
      observations: [{ identifier: { identifier: "GLU" } }],
    });
    expect(msg.get("PID.3")).toBe("MRN1");
    expect(msg.get("PID.5")).toBe("Test");
  });
});

describe("appointments() over a subclass whose segment type answers once", () => {
  const parsed = parseHL7("MSH|^~\\&|A|B|C|D|20260101||SIU^S12|1|P|2.5\rSCH|1|2\rAIS|1||CODE1");

  class Forged extends Hl7Message {
    public override allSegments(): readonly Segment[] {
      return super.allSegments().map((s) => {
        if (s.type !== "AIS") return s;
        let reads = 0;
        return new Proxy(s, {
          get(target, key) {
            if (key === "type") return reads++ === 0 ? "AIS" : "ZZZ";
            const value: unknown = Reflect.get(target, key, target);
            return typeof value === "function" ? (value as () => unknown).bind(target) : value;
          },
        });
      });
    }
  }

  it("surfaces the resource for the type it read", () => {
    const msg = new Forged({
      segments: parsed.rawSegments,
      encodingCharacters: DEFAULT_ENCODING_CHARACTERS,
      version: "2.5",
      warnings: [],
    });
    const resources = msg.appointments()[0]?.resources ?? [];
    expect(resources.map((r) => [r.kind, r.code?.identifier])).toEqual([["service", "CODE1"]]);
  });
});
