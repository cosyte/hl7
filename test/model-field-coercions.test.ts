/**
 * Field coercion integration tests — verify that every `Field.asXxx()` method
 * wires through to the corresponding Plan 02 / Plan 03 composite parser and
 * returns a correctly-shaped result against a real `parseHL7`-produced
 * message. Also verifies the empty-field fallback (no throw) and the D-09
 * "not memoized" guarantee.
 */

import { describe, expect, it } from "vitest";

import { parseHL7 } from "../src/parser/index.js";

// Comprehensive fixture exercising every composite type.
// - MSH-3: HD (APP^1.2.3^UUID)
// - MSH-7: TS (20250102153045)
// - PID-3: CX (123456^1^M11^AUTH&1.2.3&UUID^MR)
// - PID-5: XPN (Smith^Jane^Q^Jr.^Mrs.)
// - PID-11: XAD (123 Main St^Apt 4^Boston^MA^02101^USA)
// - PID-13: XTN ((555)555-1234^PRN^PH^jane@example.com)
// - PV1-3: PL (ICU^101^A^HOSP&1.2.3&UUID)
// - OBX-3: CWE/CE (GLU^Glucose^LN)
// - OBX-5: NM (120)
const FIXTURE =
  "MSH|^~\\&|APP^1.2.3^UUID|FAC|APP2|FAC2|20250102153045||ADT^A01|1|P|2.5\r" +
  "PID|||123456^1^M11^AUTH&1.2.3&UUID^MR||Smith^Jane^Q^Jr.^Mrs.||19800115|F|||123 Main St^Apt 4^Boston^MA^02101^USA||(555)555-1234^PRN^PH^jane@example.com\r" +
  "PV1|1|I|ICU^101^A^HOSP&1.2.3&UUID\r" +
  "OBX|1|NM|GLU^Glucose^LN|1|120|mg/dL|80-110||||F";

describe("model/field: .asXxx() composite coercions", () => {
  it(".asHd on MSH-3", () => {
    const msg = parseHL7(FIXTURE);
    const hd = msg.segments("MSH")[0]?.field(3).asHd();
    expect(hd).toStrictEqual({
      namespaceId: "APP",
      universalId: "1.2.3",
      universalIdType: "UUID",
    });
  });

  it(".asTs on MSH-7", () => {
    const msg = parseHL7(FIXTURE);
    const ts = msg.segments("MSH")[0]?.field(7).asTs();
    expect(ts?.raw).toBe("20250102153045");
    expect(ts).toMatchObject({ valid: true, precision: "second", year: 2025, hasTimezone: false });
  });

  it(".asCx on PID-3 with nested HD", () => {
    const msg = parseHL7(FIXTURE);
    const cx = msg.segments("PID")[0]?.field(3).asCx();
    expect(cx?.idNumber).toBe("123456");
    expect(cx?.assigningAuthority).toStrictEqual({
      namespaceId: "AUTH",
      universalId: "1.2.3",
      universalIdType: "UUID",
    });
    expect(cx?.identifierTypeCode).toBe("MR");
  });

  it(".asXpn on PID-5", () => {
    const msg = parseHL7(FIXTURE);
    const xpn = msg.segments("PID")[0]?.field(5).asXpn();
    expect(xpn?.familyName).toBe("Smith");
    expect(xpn?.givenName).toBe("Jane");
    expect(xpn?.secondName).toBe("Q");
    expect(xpn?.suffix).toBe("Jr.");
    expect(xpn?.prefix).toBe("Mrs.");
  });

  it(".asXad on PID-11", () => {
    const msg = parseHL7(FIXTURE);
    const xad = msg.segments("PID")[0]?.field(11).asXad();
    expect(xad?.street).toBe("123 Main St");
    expect(xad?.otherDesignation).toBe("Apt 4");
    expect(xad?.city).toBe("Boston");
    expect(xad?.stateOrProvince).toBe("MA");
    expect(xad?.zipOrPostalCode).toBe("02101");
    expect(xad?.country).toBe("USA");
  });

  it(".asXtn on PID-13", () => {
    const msg = parseHL7(FIXTURE);
    const xtn = msg.segments("PID")[0]?.field(13).asXtn();
    expect(xtn?.telephoneNumber).toBe("(555)555-1234");
    expect(xtn?.telecommunicationUseCode).toBe("PRN");
    expect(xtn?.telecommunicationEquipmentType).toBe("PH");
    expect(xtn?.emailAddress).toBe("jane@example.com");
  });

  it(".asPl on PV1-3 with nested facility HD", () => {
    const msg = parseHL7(FIXTURE);
    const pl = msg.segments("PV1")[0]?.field(3).asPl();
    expect(pl?.pointOfCare).toBe("ICU");
    expect(pl?.room).toBe("101");
    expect(pl?.bed).toBe("A");
    expect(pl?.facility).toStrictEqual({
      namespaceId: "HOSP",
      universalId: "1.2.3",
      universalIdType: "UUID",
    });
  });

  it(".asCwe on OBX-3", () => {
    const msg = parseHL7(FIXTURE);
    const cwe = msg.segments("OBX")[0]?.field(3).asCwe();
    expect(cwe?.identifier).toBe("GLU");
    expect(cwe?.text).toBe("Glucose");
    expect(cwe?.nameOfCodingSystem).toBe("LN");
  });

  it(".asCe on OBX-3", () => {
    const msg = parseHL7(FIXTURE);
    const ce = msg.segments("OBX")[0]?.field(3).asCe();
    expect(ce?.identifier).toBe("GLU");
    expect(ce?.text).toBe("Glucose");
    expect(ce?.nameOfCodingSystem).toBe("LN");
  });

  it(".asNm on OBX-5", () => {
    const msg = parseHL7(FIXTURE);
    const nm = msg.segments("OBX")[0]?.field(5).asNm();
    expect(nm?.raw).toBe("120");
    expect(nm?.value).toBe(120);
  });

  it("coercions on empty fields return empty typed objects (no throw)", () => {
    const msg = parseHL7("MSH|^~\\&|A|F|A|F|20250101||ADT^A01|1|P|2.5\rPID");
    const pid = msg.segments("PID")[0];
    if (pid === undefined) throw new Error("PID missing");
    expect(pid.field(5).asXpn()).toStrictEqual({});
    expect(pid.field(5).asXad()).toStrictEqual({});
    expect(pid.field(5).asCx()).toStrictEqual({});
    expect(pid.field(5).asCwe()).toStrictEqual({});
    expect(pid.field(5).asCe()).toStrictEqual({});
    expect(pid.field(5).asXtn()).toStrictEqual({});
    expect(pid.field(5).asPl()).toStrictEqual({});
    expect(pid.field(5).asHd()).toStrictEqual({});
    expect(pid.field(5).asTs()).toStrictEqual({ raw: "", valid: false, hasTimezone: false });
    expect(pid.field(5).asNm()).toStrictEqual({ raw: "", value: undefined });
  });

  it("coercions are NOT memoized (D-09): two calls → two distinct objects", () => {
    const msg = parseHL7(FIXTURE);
    const pid5 = msg.segments("PID")[0]?.field(5);
    if (pid5 === undefined) throw new Error("PID-5 missing");
    const a = pid5.asXpn();
    const b = pid5.asXpn();
    expect(a).toStrictEqual(b);
    expect(a).not.toBe(b);
  });

  it("coercions use the FIRST repetition only (rep[1] does not leak)", () => {
    // PID-5 with two repetitions: first is Smith^Jane, second is Jones^Bob.
    const msg = parseHL7(
      "MSH|^~\\&|A|F|A|F|20250101||ADT^A01|1|P|2.5\r" + "PID|||1||Smith^Jane~Jones^Bob",
    );
    const xpn = msg.segments("PID")[0]?.field(5).asXpn();
    expect(xpn?.familyName).toBe("Smith");
    expect(xpn?.givenName).toBe("Jane");
  });
});
