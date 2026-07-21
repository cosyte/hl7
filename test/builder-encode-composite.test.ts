/**
 * Unit tests for the Phase T typed-composite encoders (`encodeComposite` +
 * per-type `encodeXpn`/`encodeCx`/…) and the `Hl7Message.setComposite` setter.
 *
 * The load-bearing claims exercised here:
 *   - **emit ∘ parse identity** — `parseXxx(encodeXxx(v))` reproduces `v` on
 *     every modelled component (including nested HDs and preserved
 *     `extraComponents`), and interior empties keep positions aligned.
 *   - **no delimiter injection** — a component value full of `|^~\&` re-parses
 *     as the exact string in the exact component, never forging a boundary.
 *   - **never fabricate** — an omitted optional field encodes to
 *     empty/absent, an all-empty composite clears the field.
 *
 * All values are synthetic.
 */

import { describe, expect, it } from "vitest";

import {
  buildMessage,
  encodeCe,
  encodeComposite,
  encodeCompositeReps,
  encodeCwe,
  encodeCx,
  encodeHd,
  encodeNm,
  encodePl,
  encodeTs,
  encodeXad,
  encodeXcn,
  encodeXpn,
  encodeXtn,
  parseCe,
  parseCwe,
  parseCx,
  parseHd,
  parseHL7,
  parseNm,
  parsePl,
  parseTs,
  parseXad,
  parseXcn,
  parseXpn,
  parseXtn,
  type RawField,
  type RawRepetition,
} from "../src/index.js";
import { DEFAULT_ENCODING_CHARACTERS as ENC } from "../src/parser/delimiters.js";

/**
 * Round-trip a composite field through a real message: encode → wrap in a
 * segment → serialize → parse → return the parsed raw repetition for the field.
 * This exercises the actual serializer escape path, not just the raw tree.
 */
function roundTripField(field: RawField): RawRepetition {
  const msg = buildMessage({ type: "ADT^A01" }).addSegment("NTE", [field]);
  const parsed = parseHL7(msg.toString());
  const nte = parsed.rawSegments.find((s) => s.name === "NTE");
  const rep = nte?.fields[1]?.repetitions[0];
  if (rep === undefined) throw new Error("roundTripField: expected one parsed repetition");
  return rep;
}

describe("Phase T — typed-composite encoders (emit ∘ parse identity)", () => {
  it("XPN round-trips names, prefix, suffix", () => {
    const v = {
      familyName: "Test",
      givenName: "Ann",
      prefix: "Dr",
      suffix: "III",
      nameTypeCode: "L",
    };
    const rep = roundTripField(encodeXpn(v));
    expect(parseXpn(rep, ENC)).toEqual(v);
  });

  it("XAD round-trips street/city/state/zip", () => {
    const v = {
      street: "1 Test St",
      city: "Boston",
      stateOrProvince: "MA",
      zipOrPostalCode: "02101",
      country: "USA",
    };
    const rep = roundTripField(encodeXad(v));
    expect(parseXad(rep, ENC)).toEqual(v);
  });

  it("CX round-trips id + nested HD assigningAuthority + type", () => {
    const v = {
      idNumber: "MRN001",
      assigningAuthority: { namespaceId: "EPIC", universalId: "1.2.840", universalIdType: "ISO" },
      identifierTypeCode: "MR",
    };
    const rep = roundTripField(encodeCx(v));
    expect(parseCx(rep, ENC)).toEqual(v);
  });

  it("CX preserves interior-empty components (id + type, no authority)", () => {
    const v = { idNumber: "123", identifierTypeCode: "MR" };
    const rep = roundTripField(encodeCx(v));
    expect(parseCx(rep, ENC)).toEqual(v);
  });

  it("CWE round-trips the core 9 components", () => {
    const v = {
      identifier: "GLU",
      text: "Glucose",
      nameOfCodingSystem: "LN",
      alternateIdentifier: "2345-7",
      originalText: "Glucose SerPl-mCnc",
    };
    const rep = roundTripField(encodeCwe(v));
    expect(parseCwe(rep, ENC)).toEqual(v);
  });

  it("CWE preserves extraComponents (v2.7+ tail) verbatim", () => {
    const v = {
      identifier: "GLU",
      nameOfCodingSystem: "LN",
      extraComponents: ["1.3.6.1.4.1", "urn:oid:2.16.840"],
    };
    const rep = roundTripField(encodeCwe(v));
    expect(parseCwe(rep, ENC)).toEqual(v);
  });

  it("CE round-trips 6 components + extraComponents", () => {
    const v = {
      identifier: "GLU",
      text: "Glucose",
      nameOfCodingSystem: "L",
      extraComponents: ["x", "y"],
    };
    const rep = roundTripField(encodeCe(v));
    expect(parseCe(rep, ENC)).toEqual(v);
  });

  it("XTN round-trips phone components", () => {
    const v = {
      telephoneNumber: "555-1234",
      telecommunicationUseCode: "PRN",
      telecommunicationEquipmentType: "PH",
    };
    const rep = roundTripField(encodeXtn(v));
    expect(parseXtn(rep, ENC)).toEqual(v);
  });

  it("PL round-trips location + nested HD facility", () => {
    const v = {
      pointOfCare: "ICU",
      room: "101",
      bed: "A",
      facility: { namespaceId: "HOSP", universalId: "1.2.3", universalIdType: "UUID" },
      personLocationType: "N",
    };
    const rep = roundTripField(encodePl(v));
    expect(parsePl(rep, ENC)).toEqual(v);
  });

  it("HD round-trips namespace/universal/type", () => {
    const v = { namespaceId: "EPIC", universalId: "1.2.840.114350", universalIdType: "ISO" };
    const rep = roundTripField(encodeHd(v));
    expect(parseHd(rep, ENC)).toEqual(v);
  });

  it("XCN round-trips id + name + nested HD + typeCode", () => {
    const v = {
      idNumber: "1234567890",
      familyName: "Smith",
      givenName: "Jane",
      assigningAuthority: { namespaceId: "NPI" },
      nameTypeCode: "L",
      identifierTypeCode: "NPI",
    };
    const rep = roundTripField(encodeXcn(v));
    expect(parseXcn(rep, ENC)).toEqual(v);
  });

  it("TS round-trips a raw HL7 timestamp verbatim", () => {
    const rep = roundTripField(encodeTs("20250102153045-0500"));
    const ts = parseTs(rep, ENC);
    expect(ts.raw).toBe("20250102153045-0500");
    expect(ts.precision).toBe("second");
    expect(ts.hasTimezone).toBe(true);
  });

  it("NM round-trips a numeric string verbatim (precision preserved)", () => {
    const rep = roundTripField(encodeNm("120.50"));
    const nm = parseNm(rep, ENC);
    expect(nm.raw).toBe("120.50");
    expect(nm.value).toBe(120.5);
  });

  it("NM accepts a number", () => {
    const rep = roundTripField(encodeNm(7));
    expect(parseNm(rep, ENC).raw).toBe("7");
  });
});

describe("Phase T — no delimiter injection", () => {
  it("a component value full of delimiters re-parses as the exact string, no forged boundary", () => {
    const hostile = "a|b^c~d\\e&f";
    const rep = roundTripField(encodeXpn({ familyName: hostile, givenName: "Ann" }));
    const xpn = parseXpn(rep, ENC);
    expect(xpn.familyName).toBe(hostile);
    expect(xpn.givenName).toBe("Ann");
    // Exactly two components — the hostile value never split into more.
    expect(rep.components.length).toBe(2);
  });

  it("a CR/LF-bearing value is escaped, never a raw framing break", () => {
    const withNewline = "line1\nline2";
    const rep = roundTripField(encodeXpn({ familyName: withNewline }));
    expect(parseXpn(rep, ENC).familyName).toBe(withNewline);
  });
});

describe("Phase T — never fabricate", () => {
  it("an all-empty composite encodes to an absent field", () => {
    expect(encodeXpn({})).toEqual({ repetitions: [], isNull: false });
    expect(encodeComposite("CX", {})).toEqual({ repetitions: [], isNull: false });
  });

  it("an omitted optional field is never defaulted", () => {
    const rep = roundTripField(encodeXpn({ familyName: "Solo" }));
    expect(parseXpn(rep, ENC)).toEqual({ familyName: "Solo" });
  });
});

describe("Phase T — encoder input variants", () => {
  it("encodeCompositeReps skips an all-empty entry (no forged bare repetition)", () => {
    const field = encodeCompositeReps("CX", [{}, { idNumber: "X" }]);
    expect(field.repetitions.length).toBe(1);
    expect(field.repetitions[0]?.components[0]?.subcomponents[0]).toBe("X");
  });

  it("encodeCompositeReps of an empty array is an absent field", () => {
    expect(encodeCompositeReps("CX", [])).toEqual({ repetitions: [], isNull: false });
  });

  it("encodeNm accepts a typed NM object (raw emitted verbatim)", () => {
    const rep = roundTripField(encodeNm({ raw: "5.50", value: 5.5 }));
    expect(parseNm(rep, ENC).raw).toBe("5.50");
  });

  it("encodeTs accepts a typed TS object (raw emitted verbatim)", () => {
    const ts = parseTs(roundTripField(encodeTs("20260101120000")), ENC);
    const rep = roundTripField(encodeTs(ts));
    expect(parseTs(rep, ENC).raw).toBe("20260101120000");
  });

  it("encodeComposite dispatches every kind", () => {
    expect(encodeComposite("HD", { namespaceId: "X" }).repetitions.length).toBe(1);
    expect(encodeComposite("NM", 3).repetitions.length).toBe(1);
    expect(encodeComposite("TS", "20260101").repetitions.length).toBe(1);
    expect(encodeComposite("PL", { pointOfCare: "ICU" }).repetitions.length).toBe(1);
    expect(encodeComposite("CE", { identifier: "GLU" }).repetitions.length).toBe(1);
    expect(encodeComposite("XTN", { telephoneNumber: "5" }).repetitions.length).toBe(1);
    expect(encodeComposite("XAD", { street: "1 Main" }).repetitions.length).toBe(1);
    expect(encodeComposite("XCN", { idNumber: "9" }).repetitions.length).toBe(1);
  });
});

describe("Phase T — setComposite (path-based typed setter)", () => {
  it("sets a name at a field path and re-parses cleanly", () => {
    const msg = buildMessage({ type: "ADT^A01" }).addSegment("PID", [""]);
    msg.setComposite("PID.5", "XPN", { familyName: "Test", givenName: "Ann" });
    const round = parseHL7(msg.toString());
    expect(round.get("PID.5.1")).toBe("Test");
    expect(round.get("PID.5.2")).toBe("Ann");
  });

  it("sets a specific repetition via [n]", () => {
    const msg = buildMessage({ type: "ADT^A01" }).addSegment("PID", [""]);
    msg.setComposite("PID.3", "CX", { idNumber: "MRN001", identifierTypeCode: "MR" });
    msg.setComposite("PID.3[1]", "CX", { idNumber: "9990", identifierTypeCode: "SS" });
    const round = parseHL7(msg.toString());
    expect(round.get("PID.3[0].1")).toBe("MRN001");
    expect(round.get("PID.3[1].1")).toBe("9990");
  });

  it("rejects a component-level path", () => {
    const msg = buildMessage({ type: "ADT^A01" }).addSegment("PID", [""]);
    expect(() => msg.setComposite("PID.5.1", "XPN", { familyName: "X" })).toThrow(TypeError);
  });

  it("throws when the segment is absent (mirrors setField)", () => {
    const msg = buildMessage({ type: "ADT^A01" });
    expect(() => msg.setComposite("PID.5", "XPN", { familyName: "X" })).toThrow(TypeError);
  });

  it("a delimiter-laden value set via setComposite cannot break framing", () => {
    const msg = buildMessage({ type: "ADT^A01" }).addSegment("PID", [""]);
    msg.setComposite("PID.5", "XPN", { familyName: "Ev|il^Name", givenName: "Ann" });
    const round = parseHL7(msg.toString());
    expect(round.get("PID.5.1")).toBe("Ev|il^Name");
    expect(round.get("PID.5.2")).toBe("Ann");
    // No delimiter-injection warning (the value was escaped, not injected);
    // the message intentionally lacks PV1, so a structure warning is expected
    // and irrelevant to the framing claim under test.
    expect(round.warnings.some((w) => w.code === "UNKNOWN_ESCAPE_SEQUENCE")).toBe(false);
  });
});
