import { describe, expect, it } from "vitest";
import { buildMessage, parseHL7 } from "../src/index.js";
import type { BuildMessageInit } from "../src/index.js";
import { DEFAULT_ENCODING_CHARACTERS } from "../src/parser/delimiters.js";

describe("buildMessage (SER-06)", () => {
  describe("defaults (D-10/D-12/D-13/D-14)", () => {
    it("with only type produces a parseable, MSH-only Hl7Message", () => {
      const msg = buildMessage({ type: "ADT^A01" });
      expect(msg.rawSegments.length).toBe(1);
      expect(msg.rawSegments[0]?.name).toBe("MSH");
      expect(() => msg.toString()).not.toThrow();
      const round = parseHL7(msg.toString());
      expect(round.rawSegments[0]?.name).toBe("MSH");
    });

    it("auto-generates controlId when omitted (D-12)", () => {
      const msg = buildMessage({ type: "ADT^A01" });
      const round = parseHL7(msg.toString());
      expect(round.meta.controlId).toMatch(/^[0-9]{17}[A-Za-z0-9]{6}$/);
    });

    it("auto-generates timestamp when omitted (D-13)", () => {
      const msg = buildMessage({ type: "ADT^A01" });
      const round = parseHL7(msg.toString());
      expect(round.meta.timestamp).toBeInstanceOf(Date);
      // Should be within the last 5 seconds — a generous guard against slow
      // CI machines.
      const now = Date.now();
      const ts = round.meta.timestamp?.getTime() ?? 0;
      expect(now - ts).toBeLessThan(5000);
    });

    it("defaults version to '2.5' when omitted", () => {
      const msg = buildMessage({ type: "ADT^A01" });
      const round = parseHL7(msg.toString());
      expect(round.meta.version).toBe("2.5");
    });

    it("defaults processingId to 'P' when omitted", () => {
      const msg = buildMessage({ type: "ADT^A01" });
      const round = parseHL7(msg.toString());
      expect(round.meta.processingId).toBe("P");
    });

    it("encoding chars always default per D-14", () => {
      const msg = buildMessage({ type: "ADT^A01" });
      expect(msg.encodingCharacters).toEqual(DEFAULT_ENCODING_CHARACTERS);
    });

    it("warnings is always [] on a built message", () => {
      const msg = buildMessage({ type: "ADT^A01" });
      expect(msg.warnings).toEqual([]);
    });
  });

  describe("supplied fields (D-10)", () => {
    it("uses supplied controlId verbatim", () => {
      const msg = buildMessage({ type: "ADT^A01", controlId: "CUSTOM-ID-001" });
      const round = parseHL7(msg.toString());
      expect(round.meta.controlId).toBe("CUSTOM-ID-001");
    });

    it("formats supplied Date timestamp per D-13", () => {
      const msg = buildMessage({
        type: "ADT^A01",
        timestamp: new Date("2026-04-19T10:15:00Z"),
      });
      // MSH-7 should round-trip to the exact UTC Date.
      const round = parseHL7(msg.toString());
      expect(round.meta.timestamp?.toISOString()).toBe("2026-04-19T10:15:00.000Z");
      // Also assert the wire format has "20260419101500" literal.
      expect(msg.toString()).toContain("20260419101500");
    });

    it("passes supplied string timestamp through verbatim per D-13", () => {
      const msg = buildMessage({
        type: "ADT^A01",
        timestamp: "20260419101530.1234+0500",
      });
      expect(msg.toString()).toContain("20260419101530.1234+0500");
    });

    it("populates MSH-3/4/5/6 addressing fields", () => {
      const msg = buildMessage({
        type: "ADT^A01",
        sendingApp: "CLINIC",
        sendingFacility: "MAIN",
        receivingApp: "LAB",
        receivingFacility: "REF",
      });
      const round = parseHL7(msg.toString());
      expect(round.meta.sendingApp).toBe("CLINIC");
      expect(round.meta.sendingFacility).toBe("MAIN");
      expect(round.meta.receivingApp).toBe("LAB");
      expect(round.meta.receivingFacility).toBe("REF");
    });

    it("uses supplied version + processingId", () => {
      const msg = buildMessage({
        type: "ADT^A01",
        version: "2.8",
        processingId: "T",
      });
      const round = parseHL7(msg.toString());
      expect(round.meta.version).toBe("2.8");
      expect(round.meta.processingId).toBe("T");
    });
  });

  describe("MSH-9 type parsing", () => {
    it("splits type on '^' into messageCode + triggerEvent", () => {
      const msg = buildMessage({ type: "ADT^A01" });
      const round = parseHL7(msg.toString());
      expect(round.meta.messageCode).toBe("ADT");
      expect(round.meta.triggerEvent).toBe("A01");
      expect(round.meta.type).toBe("ADT^A01");
    });

    it("accepts three-part type with structure", () => {
      const msg = buildMessage({ type: "ORU^R01^ORU_R01" });
      const round = parseHL7(msg.toString());
      expect(round.meta.messageCode).toBe("ORU");
      expect(round.meta.triggerEvent).toBe("R01");
      expect(round.meta.messageStructure).toBe("ORU_R01");
    });
  });

  describe("chaining with addSegment (D-11/D-15)", () => {
    it("chains addSegment calls and returns an Hl7Message", () => {
      const msg = buildMessage({ type: "ADT^A01" })
        .addSegment("PID", ["", "", "MRN123", "", "Doe^John"])
        .addSegment("PV1", ["1", "I"]);
      expect(msg.rawSegments.length).toBe(3);
      expect(msg.rawSegments[0]?.name).toBe("MSH");
      expect(msg.rawSegments[1]?.name).toBe("PID");
      expect(msg.rawSegments[2]?.name).toBe("PV1");
    });

    it("chained result round-trips through parseHL7", () => {
      // D-15 scalar-string input: `addSegment` treats each string entry as a
      // single subcomponent — delimiter chars like `^` are reescape'd to
      // `\S\` on emit, so the round-trip yields a single-component PID-5,
      // not a composite XPN. Callers who need XPN components should use
      // `setField("PID.5.1", "Doe").setField("PID.5.2", "John")` after
      // construction (exercised below).
      const msg = buildMessage({ type: "ADT^A01", controlId: "MSG001" })
        .addSegment("PID", ["1", "", "MRN123", "", "", "", "19800115", "M"])
        .setField("PID.5.1", "Doe")
        .setField("PID.5.2", "John");
      const out = msg.toString();
      const round = parseHL7(out);
      expect(round.rawSegments.length).toBe(2);
      expect(round.meta.controlId).toBe("MSG001");
      expect(round.patient?.mrn).toBe("MRN123");
      expect(round.patient?.familyName).toBe("Doe");
      expect(round.patient?.givenName).toBe("John");
    });
  });

  describe("validation (D-16)", () => {
    it("throws TypeError on missing type", () => {
      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
      const missingType = {} as BuildMessageInit;
      expect(() => buildMessage(missingType)).toThrow(TypeError);
      expect(() => buildMessage(missingType)).toThrow(/type/);
    });

    it("throws TypeError on empty type", () => {
      expect(() => buildMessage({ type: "" })).toThrow(TypeError);
    });

    it("throws TypeError on whitespace-only type", () => {
      expect(() => buildMessage({ type: "   " })).toThrow(TypeError);
    });

    it("throws TypeError when type is not a string", () => {
      expect(() => buildMessage({ type: 123 as unknown as string })).toThrow(TypeError);
    });

    it("throws TypeError on `^` only (all components empty — WR-04)", () => {
      expect(() => buildMessage({ type: "^" })).toThrow(TypeError);
    });

    it("throws TypeError on `^^` (three empty components — WR-04)", () => {
      expect(() => buildMessage({ type: "^^" })).toThrow(TypeError);
    });

    it("throws TypeError on whitespace-only components like `   ^   ` (WR-04)", () => {
      expect(() => buildMessage({ type: "   ^   " })).toThrow(TypeError);
    });

    it("accepts single-component type (no `^`) — still valid", () => {
      expect(() => buildMessage({ type: "ADT" })).not.toThrow();
    });
  });

  describe("W1 empty-vs-null wire semantics", () => {
    it("empty-string field and omitted field produce IDENTICAL wire output", () => {
      const withEmpty = buildMessage({
        type: "ADT^A01",
        sendingApp: "",
        controlId: "ID1",
        timestamp: "20260419000000",
      });
      const withOmitted = buildMessage({
        type: "ADT^A01",
        controlId: "ID1",
        timestamp: "20260419000000",
      });
      // MSH lines (first \r-terminated chunk) should be identical.
      const lineWithEmpty = withEmpty.toString().split("\r")[0];
      const lineWithOmitted = withOmitted.toString().split("\r")[0];
      expect(lineWithEmpty).toBe(lineWithOmitted);
    });

    it("emitting HL7 explicit null requires .setField('MSH.3', '\"\"') after construction", () => {
      const msg = buildMessage({
        type: "ADT^A01",
        controlId: "ID1",
        timestamp: "20260419000000",
      });
      // Before setField: MSH-3 is absent (`||`).
      const beforeOut = msg.toString();
      expect(beforeOut).toContain("||"); // adjacent pipes around the absent MSH-3 slot

      // Apply explicit null via setField.
      msg.setField("MSH.3", '""');

      // After: MSH-3 renders as the literal `""` (2 chars). The round-trip
      // preserves isNull:true on that field.
      const afterOut = msg.toString();
      expect(afterOut).toContain('|""|'); // MSH-3 is literal explicit null
      const round = parseHL7(afterOut);
      const mshRound = round.rawSegments.find((s) => s.name === "MSH");
      // MSH-3 = fields[2] per parser convention.
      expect(mshRound?.fields[2]?.isNull).toBe(true);
    });
  });

  describe("round-trip", () => {
    it("full-fledged built message round-trips structurally", () => {
      const original = buildMessage({
        type: "ADT^A01^ADT_A01",
        sendingApp: "CLINIC",
        sendingFacility: "MAIN",
        receivingApp: "LAB",
        receivingFacility: "REF",
        controlId: "MSG001",
        timestamp: new Date("2026-04-19T10:15:00Z"),
        version: "2.5",
        processingId: "P",
      })
        .addSegment("PID", ["1", "", "MRN123", "", "Doe^John^Q", "", "19800115", "M"])
        .addSegment("PV1", ["1", "I", "ICU^101^A"]);

      const out = original.toString();
      const round = parseHL7(out);
      expect(round.rawSegments.length).toBe(3);
      expect(round.meta.type).toBe("ADT^A01^ADT_A01");
      expect(round.meta.controlId).toBe("MSG001");
      // Idempotent:
      const twice = parseHL7(round.toString()).toString();
      expect(twice).toBe(out);
    });
  });
});
