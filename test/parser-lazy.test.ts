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

/** The internals of a pending entry this test reads: its source's cache and its index there. */
interface PendingInternals {
  readonly source: { readonly built: readonly unknown[] };
  readonly index: number;
}

/** Which segments of a message are still unbuilt, by their position in the message. */
function pending(msg: Hl7Message): number[] {
  const list = (msg as unknown as { _segments: readonly unknown[] })._segments;
  const out: number[] = [];
  list.forEach((s, i) => {
    if (!(s instanceof PendingSegment)) return;
    const { source, index } = s as unknown as PendingInternals;
    if (source.built[index] === undefined) out.push(i);
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

  it("builds everything on toString and gives the eager text", () => {
    const msg = parseHL7(TEXT);
    expect(msg.toString()).toBe(parseHL7(TEXT, { lazy: false }).toString());
    expect(pending(msg)).toEqual([]);
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

  it("never shares a built segment between two messages parsed from one text", () => {
    const a = parseHL7(TEXT);
    const b = parseHL7(TEXT);
    expect(a.part("PID")?.raw).not.toBe(b.part("PID")?.raw);
    a.setField("PID.5.1", "Changed");
    expect(b.get("PID.5.1")).toBe("Roe");
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
