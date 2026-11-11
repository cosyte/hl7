/**
 * The typed views read EI where the standard puts one: MSH-21 on `msg.meta`,
 * OBR-2 and OBR-3 and the preceding ORC-2 and ORC-3 on each order. The flat
 * string fields that read only the first component stay as they were.
 *
 * All values are synthetic.
 */

import { describe, expect, it } from "vitest";

import { parseHL7 } from "../src/index.js";

const MSH_PLAIN = "MSH|^~\\&|APP|FAC|LAB|REF|20260102||ORM^O01|CTRL1|P|2.5.1\r";
const MSH_PROFILES =
  "MSH|^~\\&|APP|FAC|LAB|REF|20260102||ORM^O01|CTRL1|P|2.5.1|||||||||" +
  "PROF-1^CLINIC^2.16.840.1.113883.19.1^ISO~~PROF-2\r";

describe("meta.messageProfileIdentifiers (MSH-21)", () => {
  it("reads every MSH-21 repetition as an EI and skips an empty one", () => {
    const meta = parseHL7(MSH_PROFILES + "PID|1||MRN0001").meta;
    expect(meta.messageProfileIdentifiers).toStrictEqual([
      {
        entityIdentifier: "PROF-1",
        namespaceId: "CLINIC",
        universalId: "2.16.840.1.113883.19.1",
        universalIdType: "ISO",
      },
      { entityIdentifier: "PROF-2" },
    ]);
    expect(Object.isFrozen(meta.messageProfileIdentifiers)).toBe(true);
    expect(Object.isFrozen(meta.messageProfileIdentifiers?.[0])).toBe(true);
  });

  it("is omitted when MSH-21 is empty", () => {
    const meta = parseHL7(MSH_PLAIN + "PID|1||MRN0001").meta;
    expect("messageProfileIdentifiers" in meta).toBe(false);
  });
});

describe("order placer and filler identifiers as EI", () => {
  const raw =
    MSH_PLAIN +
    "PID|1||MRN0001\r" +
    "ORC|NW|PL-1001^CLINIC^2.16.840.1.113883.19.5^ISO|FL-2002^LAB\r" +
    "OBR|1|PL-1001^CLINIC^2.16.840.1.113883.19.5^ISO|FL-2002^LAB|GLU^Glucose^LN\r" +
    "OBR|2|PL-1002|||\r" +
    "ORC|NW|ORPHAN-1";

  it("reads OBR-2 and OBR-3 whole, keeping the flat numbers as before", () => {
    const [first] = parseHL7(raw).orders();
    expect(first?.placerOrderNumber).toBe("PL-1001");
    expect(first?.fillerOrderNumber).toBe("FL-2002");
    expect(first?.placerOrderId).toStrictEqual({
      entityIdentifier: "PL-1001",
      namespaceId: "CLINIC",
      universalId: "2.16.840.1.113883.19.5",
      universalIdType: "ISO",
    });
    expect(first?.fillerOrderId).toStrictEqual({ entityIdentifier: "FL-2002", namespaceId: "LAB" });
    expect(Object.isFrozen(first?.placerOrderId)).toBe(true);
  });

  it("reads ORC-2 and ORC-3 from the ORC itself", () => {
    const [first] = parseHL7(raw).orders();
    expect(first?.orcPlacerOrderId).toStrictEqual({
      entityIdentifier: "PL-1001",
      namespaceId: "CLINIC",
      universalId: "2.16.840.1.113883.19.5",
      universalIdType: "ISO",
    });
    expect(first?.orcFillerOrderId).toStrictEqual({
      entityIdentifier: "FL-2002",
      namespaceId: "LAB",
    });
  });

  it("omits what was not sent and never copies OBR-2 onto a missing ORC", () => {
    const second = parseHL7(raw).orders()[1];
    expect(second?.placerOrderId).toStrictEqual({ entityIdentifier: "PL-1002" });
    expect(second !== undefined && "fillerOrderId" in second).toBe(false);
    expect(second !== undefined && "orcPlacerOrderId" in second).toBe(false);
    expect(second !== undefined && "orcFillerOrderId" in second).toBe(false);
  });

  it("omits ORC-2 and ORC-3 when the attached ORC leaves them empty", () => {
    const [only] = parseHL7(MSH_PLAIN + "ORC|NW\rOBR|1|PL-1|FL-1").orders();
    expect(only?.orderControl).toBe("NW");
    expect(only !== undefined && "orcPlacerOrderId" in only).toBe(false);
    expect(only !== undefined && "orcFillerOrderId" in only).toBe(false);
  });
});
