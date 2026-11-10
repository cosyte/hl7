/**
 * A segment or message of a lazily parsed message logs, serializes and spreads exactly as one of an
 * eagerly parsed message does, read or not: the same own keys in the same order, `fields` and `raw`
 * with their values, and nothing that reaches the message text. A segment's output never holds
 * another segment's text. Every message here is synthetic.
 */

import { inspect } from "node:util";

import { describe, expect, it } from "vitest";

import { parseHL7 } from "../src/index.js";
import type { Hl7Message, Segment } from "../src/index.js";

const TEXT =
  "MSH|^~\\&|LAB|FAC|EHR|FAC|20260101120000||ORU^R01|R1|P|2.5\r" +
  "PID|1||FAKE7^^^HOSP^MR||Roe^Sam\r" +
  "OBX|1|NM|GLU^Glucose^LN||81|mg/dL||N|||F\r" +
  "OBX|2|NM|GLU^Glucose^LN||82|mg/dL||N|||F\r";

/** Text only the PID segment holds: an OBX's output must not carry it. */
const PID_ONLY = ["Roe", "Sam", "FAKE7"];

/** A segment's own keys, in the order every release so far has had them. */
const SEGMENT_KEYS = [
  "type",
  "fields",
  "enc",
  "absoluteIndex",
  "raw",
  "customFields",
  "dateFormats",
  "_fieldWrappers",
];

/** A message's own keys, in the order every release so far has had them. */
const MESSAGE_KEYS = [
  "rawSegments",
  "encodingCharacters",
  "version",
  "warnings",
  "profile",
  "dateFormats",
  "_customSegments",
  "_segmentOverrides",
  "_segmentsByType",
  "_allSegments",
  "_meta",
  "_structure",
  "_patient",
  "_visit",
];

const FULL = { depth: Infinity, showHidden: false } as const;

/** Every way a segment is commonly logged or serialized, each from a fresh parse. */
function segmentOutputs(
  lazy: boolean,
  read: boolean,
  how: "json" | "inspect" | "keys" | "spread",
): string {
  const msg = parseHL7(TEXT, { lazy });
  const obx = msg.segments("OBX")[0] as Segment;
  if (read) void obx.field(5).value;
  switch (how) {
    case "json":
      return JSON.stringify(obx);
    case "inspect":
      return inspect(obx, FULL);
    case "keys":
      return JSON.stringify(Object.keys(obx));
    case "spread":
      return JSON.stringify({ ...obx });
  }
}

describe("a segment logs and serializes the same in both modes", () => {
  for (const read of [false, true]) {
    for (const how of ["json", "inspect", "keys", "spread"] as const) {
      it(`${how}, ${read ? "after" : "before"} the segment is read`, () => {
        const lazy = segmentOutputs(true, read, how);
        const eager = segmentOutputs(false, read, how);
        expect(lazy).toBe(eager);
        for (const text of PID_ONLY) {
          expect(lazy).not.toContain(text);
          expect(eager).not.toContain(text);
        }
      });
    }
  }

  for (const lazy of [true, false]) {
    const mode = lazy ? "lazy" : "eager";

    it(`has the keys every release has had, ${mode}`, () => {
      const obx = parseHL7(TEXT, { lazy }).segments("OBX")[1] as Segment;
      expect(Object.keys(obx)).toEqual(SEGMENT_KEYS);
      expect(Object.keys({ ...obx })).toEqual(SEGMENT_KEYS);
    });

    it(`serializes fields and raw as the built segment, ${mode}`, () => {
      const msg = parseHL7(TEXT, { lazy });
      const obx = msg.segments("OBX")[1] as Segment;
      const parsed = JSON.parse(JSON.stringify(obx)) as Record<string, unknown>;
      expect(Object.keys(parsed)).toEqual([
        "type",
        "fields",
        "enc",
        "absoluteIndex",
        "raw",
        "dateFormats",
      ]);
      const built = parseHL7(TEXT, { lazy: false }).rawSegments[3];
      expect(parsed["raw"]).toEqual(JSON.parse(JSON.stringify(built)));
      expect(parsed["fields"]).toEqual(JSON.parse(JSON.stringify(built?.fields)));
      const spread = { ...obx };
      expect(spread.raw).toBe(msg.rawSegments[3]);
      expect(spread.fields).toBe(msg.rawSegments[3]?.fields);
    });

    it(`holds nothing enumerable that reaches the message text, ${mode}`, () => {
      const obx = parseHL7(TEXT, { lazy }).segments("OBX")[0] as Segment;
      const seen = new Set<unknown>();
      const walk = (v: unknown): void => {
        if (typeof v === "string") {
          for (const text of PID_ONLY) expect(v).not.toContain(text);
          return;
        }
        if (v === null || typeof v !== "object" || seen.has(v)) return;
        seen.add(v);
        for (const key of Object.keys(v)) walk((v as Record<string, unknown>)[key]);
      };
      walk(obx);
      expect(inspect(obx, { ...FULL, showHidden: true })).not.toMatch(/Pending|SegmentSource/);
    });
  }
});

/** A message after the same reads, logged one way. */
function messageOutput(lazy: boolean, how: "json" | "inspect" | "keys"): string {
  const msg: Hl7Message = parseHL7(TEXT, { lazy });
  void msg.segments("OBX")[0]?.field(5).value;
  switch (how) {
    case "json":
      return JSON.stringify(msg);
    case "inspect":
      return inspect(msg, FULL);
    case "keys":
      return JSON.stringify(Object.keys(msg));
  }
}

describe("a message logs and serializes the same in both modes", () => {
  for (const how of ["json", "inspect", "keys"] as const) {
    it(how, () => {
      const lazy = messageOutput(true, how);
      expect(lazy).toBe(messageOutput(false, how));
      expect(lazy).not.toMatch(/Pending|SegmentSource|_segments\b|_allBuilt/);
    });
  }

  for (const lazy of [true, false]) {
    const mode = lazy ? "lazy" : "eager";

    it(`has the keys every release has had, read or not, ${mode}`, () => {
      const msg = parseHL7(TEXT, { lazy });
      expect(Object.keys(msg)).toEqual(MESSAGE_KEYS);
      void msg.get("PID.5.1");
      expect(Object.keys(msg)).toEqual(MESSAGE_KEYS);
      void msg.rawSegments;
      expect(Object.keys(msg)).toEqual(MESSAGE_KEYS);
      msg.setField("OBX[1].5", "90");
      expect(Object.keys(msg)).toEqual(MESSAGE_KEYS);
    });

    it(`spreads to the built segments, ${mode}`, () => {
      const msg = parseHL7(TEXT, { lazy });
      const spread = { ...msg };
      expect(spread.rawSegments).toEqual(parseHL7(TEXT, { lazy: false }).rawSegments);
      expect(spread.rawSegments).toBe(msg.rawSegments);
    });

    it(`inspects the same before anything is read, ${mode}`, () => {
      const out = inspect(parseHL7(TEXT, { lazy }), FULL);
      expect(out).toBe(inspect(parseHL7(TEXT, { lazy: false }), FULL));
      expect(out).not.toMatch(/Pending|SegmentSource|Getter/);
    });

    it(`takes rawSegments assigned through a cast as its list, as it always has, ${mode}`, () => {
      const msg = parseHL7(TEXT, { lazy });
      const other = parseHL7("MSH|^~\\&|A|B|C|D|20260101||ACK^A01|9|P|2.5\rMSA|AA|9", { lazy });
      (msg as unknown as { rawSegments: unknown }).rawSegments = other.rawSegments;
      expect(msg.rawSegments).toBe(other.rawSegments);
      expect(msg.toString()).toBe(other.toString());
      expect(msg.get("MSA.1")).toBe("AA");
      expect(Object.keys(msg)).toEqual(MESSAGE_KEYS);
    });

    it(`keeps rawSegments a plain list once an edit leaves nothing to build, ${mode}`, () => {
      const msg = parseHL7(TEXT, { lazy });
      for (const s of msg.allSegments()) void s.fields;
      msg.setField("OBX[0].5", "70");
      expect(Object.getOwnPropertyDescriptor(msg, "rawSegments")).toHaveProperty("value");
      const plain = msg.rawSegments.map((s) => Object.getPrototypeOf(s) === Object.prototype);
      expect(plain).toEqual([true, true, true, true]);
      expect(msg.toString()).toContain("|70|");
    });
  }

  for (const read of [false, true]) {
    it(`takes fields and raw assigned through a cast, ${read ? "after" : "before"} a read`, () => {
      const lazy = parseHL7(TEXT).segments("OBX")[0] as Segment;
      const eager = parseHL7(TEXT, { lazy: false }).segments("OBX")[0] as Segment;
      for (const obx of [lazy, eager]) {
        if (read) void obx.field(1).value;
        const built = obx.raw;
        (obx as unknown as { fields: unknown }).fields = [];
        expect(obx.fields).toEqual([]);
        expect(obx.raw).toBe(built);
        expect(obx.field(1).value).toBe(read ? "1" : "");
        const other = { name: "NTE", fields: [] };
        (obx as unknown as { raw: unknown }).raw = other;
        expect(obx.raw).toBe(other);
        expect(Object.keys(obx)).toEqual(SEGMENT_KEYS);
      }
      const fresh = parseHL7(TEXT).segments("OBX")[1] as Segment;
      (fresh as unknown as { raw: unknown }).raw = null;
      expect(fresh.raw).toBeNull();
      expect(fresh.field(5).value).toBe("82");
    });
  }
});
