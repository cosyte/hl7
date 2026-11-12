/**
 * A lazy parse, the default: the parse scans the whole message and reports every warning, keeps the
 * text and where each segment starts, and builds a segment's tree the first time something reads
 * it. `{ lazy: false }` builds every segment during the parse. Every message here is synthetic.
 */

import { describe, expect, it } from "vitest";

import { Hl7ParseError, WARNING_CODES, parseHL7 } from "../src/index.js";
import type { Hl7Message, Hl7ParseWarning } from "../src/index.js";
import { PendingSegment } from "../src/parser/segment-source.js";
import { fieldArrivedAltered } from "../src/parser/wire-fidelity.js";

const TEXT =
  "MSH|^~\\&|LAB|FAC|EHR|FAC|20260101120000||ORU^R01|R1|P|2.5\r" +
  "PID|1||FAKE1^^^HOSP^MR||Roe^Sam\r" +
  "PV1|1|I|WARD^1\r" +
  "OBR|1||ACC1|CBC^Count^LN\r" +
  "OBX|1|NM|GLU^Glucose^LN||81|mg/dL||N|||F\r" +
  "OBX|2|NM|GLU^Glucose^LN||82|mg/dL||N|||F\r" +
  "OBX|3|NM|GLU^Glucose^LN||83|mg/dL||N||| F\r";

/** Which segments of a message are still unbuilt, by their position in the message. */
function pending(msg: Hl7Message): number[] {
  const list = (msg as unknown as { entries(): readonly unknown[] }).entries();
  const out: number[] = [];
  list.forEach((s, i) => {
    if (s instanceof PendingSegment && !s.built) out.push(i);
  });
  return out;
}

describe("a lazy parse (the default)", () => {
  it("builds MSH alone during the parse", () => {
    expect(pending(parseHL7(TEXT))).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("builds every segment during the parse with { lazy: false }", () => {
    expect(pending(parseHL7(TEXT, { lazy: false }))).toEqual([]);
  });

  it("is lazy with { lazy: true } and with options that do not name it", () => {
    expect(pending(parseHL7(TEXT, { lazy: true }))).toHaveLength(6);
    expect(pending(parseHL7(TEXT, { strict: false }))).toHaveLength(6);
  });

  it("reads lazy as an option, not a profile, beside a string name", () => {
    const options = { name: "not-a-profile", lazy: false } as unknown as { lazy: boolean };
    const msg = parseHL7(TEXT, options);
    expect(pending(msg)).toEqual([]);
    expect(msg.profile).toBeUndefined();
  });

  it("builds only the segment a dot-path reaches", () => {
    const msg = parseHL7(TEXT);
    expect(msg.get("PID.5.1")).toBe("Roe");
    expect(pending(msg)).toEqual([2, 3, 4, 5, 6]);
    expect(msg.get("OBX[1].5")).toBe("82");
    expect(pending(msg)).toEqual([2, 3, 4, 6]);
    expect(msg.get("ZZZ.1")).toBeUndefined();
    expect(pending(msg)).toEqual([2, 3, 4, 6]);
  });

  it("makes segment wrappers without building, and builds one when its fields are read", () => {
    const msg = parseHL7(TEXT);
    const obx = msg.segments("OBX");
    expect(obx.map((s) => s.type)).toEqual(["OBX", "OBX", "OBX"]);
    expect(msg.allSegments()).toHaveLength(7);
    expect(pending(msg)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(obx[2]?.field(11).value).toBe("F");
    expect(pending(msg)).toEqual([1, 2, 3, 4, 5]);
    expect(msg.part("PV1")?.fields).toHaveLength(4);
    expect(pending(msg)).toEqual([1, 3, 4, 5]);
  });

  it("hands every reader the same built segment, built once", () => {
    const msg = parseHL7(TEXT);
    const viaWrapper = msg.segments("PID")[0]?.raw;
    const viaWrapperAgain = msg.segments("PID")[0]?.raw;
    expect(viaWrapper).toBe(viaWrapperAgain);
    expect(msg.rawSegments[1]).toBe(viaWrapper);
    expect(msg.segments("PID")[0]?.fields).toBe(viaWrapper?.fields);
  });

  it("builds everything on rawSegments, once, and holds no pending entry after", () => {
    const msg = parseHL7(TEXT);
    const all = msg.rawSegments;
    expect(pending(msg)).toEqual([]);
    expect(all.some((s) => s instanceof PendingSegment)).toBe(false);
    expect(msg.rawSegments).toBe(all);
    expect(all).toEqual(parseHL7(TEXT, { lazy: false }).rawSegments);
  });

  it("writes an unread segment from its own text on toString and gives the eager text", () => {
    const msg = parseHL7(TEXT);
    expect(msg.toString()).toBe(parseHL7(TEXT, { lazy: false }).toString());
    // OBX 3 had a field trimmed, so it is built and written from its tree; no other segment is.
    expect(pending(msg)).toEqual([1, 2, 3, 4, 5]);
    expect(msg.toString()).toBe(parseHL7(TEXT, { lazy: false }).toString());
    expect(msg.rawSegments).toEqual(parseHL7(TEXT, { lazy: false }).rawSegments);
  });

  // Each line is a segment whose text the writer changes, so it must be built and written from its
  // tree, or one it writes back unchanged. `built` says which: true when toString must build it.
  const WRITES: readonly {
    readonly segment: string;
    readonly built: boolean;
    readonly msh?: string;
  }[] = [
    { segment: "PID|1||FAKE1^^^HOSP^MR||Roe^Sam", built: false },
    { segment: "PID|1||", built: false },
    { segment: "PID|1", built: false },
    { segment: 'PID|1|""|A^""', built: false },
    { segment: "PID|1|A~B~|C", built: false },
    { segment: "ZZZ", built: false },
    { segment: "|x|y", built: false },
    { segment: "", built: false },
    { segment: "OBX|1|A#B", built: false },
    { segment: "PID|", built: true },
    { segment: "PID|1|A^", built: true },
    { segment: "PID|1|A^~B", built: true },
    { segment: "PID|1|A^|B", built: true },
    { segment: "PID|1|A&", built: true },
    { segment: "PID|1|A&^B", built: true },
    { segment: "PID|1|A&~B", built: true },
    { segment: "PID|1|A&|B", built: true },
    { segment: "PID|1|^", built: true },
    { segment: "PID|1|&&", built: true },
    { segment: "PID|1|A\\F\\B", built: true },
    { segment: "PID|1| A ", built: true },
    { segment: "MSH", built: true },
    { segment: "MSH|^~\\&|X", built: true },
    { segment: "OBX|1|A#B", built: true, msh: "MSH|^~\\&#|A|B|C|D|20260101||ORU^R01|1|P|2.7\r" },
    { segment: "OBX|1|A\u000bB", built: true },
  ];

  for (const { segment, built, msh } of WRITES) {
    it(`writes ${JSON.stringify(segment)} as the eager parse does${msh === undefined ? "" : ", in v2.7"}`, () => {
      const text = `${msh ?? "MSH|^~\\&|A|B|C|D|20260101||ORU^R01|1|P|2.5\r"}${segment}\rNTE|1||end\r`;
      const msg = parseHL7(text);
      expect(msg.toString()).toBe(parseHL7(text, { lazy: false }).toString());
      expect(pending(msg)).toEqual(built ? [2] : [1, 2]);
    });
  }

  // MSH-2 can name a character outside the Basic Multilingual Plane, two UTF-16 code units. No
  // segment of such a message is written from its text, whichever delimiter it is.
  const WIDE = "\u{1F600}";
  for (const [delimiter, msh2, segment] of [
    ["component", `${WIDE}~\\&`, `PID|1|A${WIDE}`],
    ["repetition", `^${WIDE}\\&`, `PID|1|A^${WIDE}B`],
    ["subcomponent", `^~\\${WIDE}`, `PID|1|A${WIDE}`],
    ["truncation", `^~\\&${WIDE}`, `PID|1|A${WIDE}B`],
  ] as const) {
    it(`writes every segment from its tree when the ${delimiter} is two code units`, () => {
      const text = `MSH|${msh2}|A|B|C|D|20260101||ORU^R01|1|P|2.7\r${segment}\rNTE|1||end\r`;
      const msg = parseHL7(text);
      expect(msg.toString()).toBe(parseHL7(text, { lazy: false }).toString());
      expect(pending(msg)).toEqual([]);
    });
  }

  it("writes from the tree when the encoding characters are not the ones the text was read with", () => {
    const msg = parseHL7(TEXT);
    const swapped = { ...msg.encodingCharacters, component: "@" };
    (msg as unknown as { encodingCharacters: unknown }).encodingCharacters = swapped;
    const eager = parseHL7(TEXT, { lazy: false });
    (eager as unknown as { encodingCharacters: unknown }).encodingCharacters = swapped;
    expect(msg.toString()).toBe(eager.toString());
  });

  it("writes a segment from its tree once something has read it, even an edited tree", () => {
    const msg = parseHL7(TEXT);
    const pid = msg.part("PID");
    expect(pid?.field(5).value).toBe("Roe");
    const raw = pid?.raw as unknown as {
      fields: { repetitions: { components: { subcomponents: string[] }[] }[] }[];
    };
    const sub = raw.fields[5]?.repetitions[0]?.components[0]?.subcomponents;
    if (sub !== undefined) sub[0] = "Poe";
    expect(msg.toString()).toContain("PID|1||FAKE1^^^HOSP^MR||Poe^Sam\r");
  });

  it("builds the segment an edit changes, and no other", () => {
    const msg = parseHL7(TEXT);
    msg.setField("OBX[1].5", "99");
    expect(pending(msg)).toEqual([1, 2, 3, 4, 6]);
    msg.setComposite("PID.5", "XPN", { familyName: "Poe" });
    expect(pending(msg)).toEqual([2, 3, 4, 6]);
    msg.removeSegment("OBR");
    msg.addSegment("NTE", ["1", "", "note"]);
    expect(pending(msg)).toEqual([2, 3, 5]);
    const eager = parseHL7(TEXT, { lazy: false });
    eager.setField("OBX[1].5", "99");
    eager.setComposite("PID.5", "XPN", { familyName: "Poe" });
    eager.removeSegment("OBR");
    eager.addSegment("NTE", ["1", "", "note"]);
    expect(msg.toString()).toBe(eager.toString());
    expect(msg.rawSegments).toEqual(eager.rawSegments);
  });

  it("keeps a segment wrapper on the segment it was made for after an edit moves positions", () => {
    const msg = parseHL7(TEXT);
    const pv1 = msg.part("PV1");
    msg.removeSegment("PID");
    expect(pv1?.raw.name).toBe("PV1");
    expect(pv1?.field(3).value).toBe("WARD");
    expect(msg.get("PV1.3.1")).toBe("WARD");
  });

  it("reports every warning during the parse, and none on a later read", () => {
    const seen: Hl7ParseWarning[] = [];
    const text = TEXT + "NTE|1||\\Q\\\rZZZ|1\r";
    const msg = parseHL7(text, { onWarning: (w) => seen.push(w) });
    const atParse = seen.map((w) => w.code);
    expect(atParse).toEqual([
      WARNING_CODES.FIELD_WHITESPACE_TRIMMED,
      WARNING_CODES.UNKNOWN_ESCAPE_SEQUENCE,
      WARNING_CODES.UNKNOWN_SEGMENT,
    ]);
    expect(msg.warnings.map((w) => w.code)).toEqual(atParse);
    void msg.rawSegments;
    void msg.toString();
    expect(seen.map((w) => w.code)).toEqual(atParse);
    expect(msg.warnings).toEqual(parseHL7(text, { lazy: false }).warnings);
  });

  it("throws in strict mode during the parse for a problem in the last segment", () => {
    const text = TEXT + "NTE|1||\\Q\\\r";
    let thrown: unknown;
    try {
      parseHL7(text, { strict: true, trimFields: false });
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(Hl7ParseError);
    expect((thrown as Hl7ParseError).code).toBe(WARNING_CODES.UNKNOWN_ESCAPE_SEQUENCE);
    expect((thrown as Hl7ParseError).position.segmentIndex).toBe(7);
  });

  it("marks a trimmed field as altered on the wire when its segment is built later", () => {
    const msg = parseHL7(TEXT);
    const obx3 = msg.segments("OBX")[2];
    expect(obx3 === undefined ? false : fieldArrivedAltered(obx3.field(11).raw)).toBe(true);
    const obx1 = msg.segments("OBX")[0];
    expect(obx1 === undefined ? true : fieldArrivedAltered(obx1.field(11).raw)).toBe(false);
  });

  it("marks a field a framing byte was stripped from when its segment is built later", () => {
    const framed = "MSH|^~\\&|A|B|C|D|20260101||ORU^R01|1|P|2.5\rOBX|1|NM|X||5|||N|||\u000bF\r";
    const msg = parseHL7(framed);
    expect(pending(msg)).toEqual([1]);
    const obx = msg.segments("OBX")[0];
    expect(obx === undefined ? false : fieldArrivedAltered(obx.field(11).raw)).toBe(true);
  });

  it("trims and marks every trimmed field of a segment, in both modes", () => {
    const text = "MSH|^~\\&|A|B|C|D|20260101||ORU^R01|1|P|2.5\rOBX|1|NM|X|| 5 |||| F";
    for (const lazy of [true, false]) {
      const obx = parseHL7(text, { lazy }).segments("OBX")[0];
      expect([obx?.field(5).value, obx?.field(9).value]).toEqual(["5", "F"]);
      expect(
        obx === undefined ? [] : [5, 9].map((n) => fieldArrivedAltered(obx.field(n).raw)),
      ).toEqual([true, true]);
    }
  });

  it("marks every field of a segment a framing byte was stripped from, in both modes", () => {
    const text =
      "\u000bMSH|^~\\&|A|B|C|D|20260101||ORU^R01|1|P|2.5\rOBX|1|NM|X||5\u000b|||||F\u000b\u001c\r";
    for (const lazy of [true, false]) {
      const obx = parseHL7(text, { lazy }).segments("OBX")[0];
      expect(
        obx === undefined ? [] : [4, 5, 10].map((n) => fieldArrivedAltered(obx.field(n).raw)),
      ).toEqual([false, true, true]);
    }
  });

  it("never shares a built segment between two messages parsed from one text", () => {
    const a = parseHL7(TEXT);
    const b = parseHL7(TEXT);
    expect(a.part("PID")?.raw).not.toBe(b.part("PID")?.raw);
    a.setField("PID.5.1", "Changed");
    expect(b.get("PID.5.1")).toBe("Roe");
  });

  it("builds odd segments the same way in both modes", () => {
    const text =
      "MSH|^~\\&|A|B|C|D|20260101||ORU^R01|1|P|2.5\r" +
      "\r" +
      "ZZZ\r" +
      "|x|y\r" +
      "PID|\r" +
      "MSH\r" +
      "NTE|1|| a ";
    const eager = parseHL7(text, { lazy: false });
    const lazy = parseHL7(text);
    const names = eager.rawSegments.map((s) => s.name);
    expect(names).toEqual(["MSH", "", "ZZZ", "", "PID", "MSH", "NTE"]);
    expect(eager.rawSegments[1]).toEqual({ name: "", fields: [] });
    expect(
      eager.rawSegments[2]?.fields.map((f) => f.repetitions[0]?.components[0]?.subcomponents[0]),
    ).toEqual(["ZZZ"]);
    expect(eager.rawSegments[3]?.fields).toHaveLength(3);
    expect(eager.rawSegments[4]?.fields).toHaveLength(1);
    expect(eager.get("NTE.3")).toBe("a");
    expect(lazy.rawSegments).toEqual(eager.rawSegments);
    expect(lazy.toString()).toBe(eager.toString());
    expect(lazy.warnings).toEqual(eager.warnings);
  });

  it("builds each of many segments from its own text", () => {
    const lines = Array.from({ length: 200 }, (_v, k) => `OBX|${String(k + 1)}|NM|X||${String(k)}`);
    const text = `MSH|^~\\&|A|B|C|D|20260101||ORU^R01|1|P|2.5\r${lines.join("\r")}`;
    const msg = parseHL7(text);
    expect(msg.get("OBX[150].5")).toBe("150");
    expect(msg.get("OBX[199].1")).toBe("200");
    expect(msg.get("OBX[0].5")).toBe("0");
    expect(pending(msg)).toHaveLength(197);
  });
});
