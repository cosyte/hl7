/**
 * `msg.allergies()` over IAM (Patient Adverse Reaction Information) as well as
 * AL1: one entry per segment in document order, each naming its source segment,
 * with IAM-6 surfaced verbatim as the action code and an exact `D` marked as a
 * delete request that is still returned.
 *
 * Every fixture in this file is SYNTHETIC, written by hand for these tests: no
 * value was taken from a real message. The patient carries no name, date of
 * birth, address or real identifier (`PID|||X`), and the allergy identifiers
 * are made-up `ALG-` tokens.
 *
 * Corpus tiers (standards-conformance S4): the ADT^A60 and interleaved ADT^A01
 * messages are tier 1 (spec-clean); the lowercase, deprecated, unlisted,
 * repeated, escaped and truncated IAM-6 / IAM field cases are tier 2
 * (vendor-quirk, reproduced synthetically). The change adds no emit path, so
 * tier 3 (round-trip) is not touched.
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";

import type { Allergy } from "../src/index.js";
import { parseHL7 } from "../src/index.js";

const MSH_A60 = "MSH|^~\\&|APP|FAC|||20250102||ADT^A60^ADT_A60|1|P|2.5\r";
const MSH_A01 = "MSH|^~\\&|APP|FAC|||20250102||ADT^A01^ADT_A01|1|P|2.5\r";
const EVN_A60 = "EVN|A60|20250102\r";
const EVN_A01 = "EVN|A01|20250102\r";
const PID = "PID|||X\r";
const PV1 = "PV1|1|I\r";

/** A synthetic ADT^A60 whose body is `iamGroups` (IAM segments and their children). */
function a60(...iamGroups: readonly string[]): string {
  return MSH_A60 + EVN_A60 + PID + PV1 + iamGroups.map((s) => `${s}\r`).join("");
}

/** The one entry an ADT^A60 carrying the single IAM `iam` yields. */
function onlyEntry(iam: string): Allergy {
  const entries = parseHL7(a60(iam)).allergies();
  expect(entries).toHaveLength(1);
  const entry = entries[0];
  if (entry === undefined) throw new Error("expected one allergy entry");
  return entry;
}

describe("allergies(): IAM in an ADT^A60 (AC-1)", () => {
  const msg = parseHL7(
    a60(
      "IAM|1|DA^Drug allergy^HL70127|PEN^Penicillin^L|SV^Severe^HL70128|Hives~Rash|A^Add^HL70206|ALG-0001^LAB^2.16.840.1.113883.19.5^ISO",
      "NTE|1||Synthetic note on the first reaction",
      "IAR|HIVES^Hives^L|SV|SEN|Antihistamine",
      "IAR|RASH^Rash^L|MI",
      "IAM|2|FA^Food allergy^HL70127|NUT^Peanut^L|MO^Moderate^HL70128|Swelling|A|ALG-0002",
      "NTE|1||Synthetic note on the second reaction",
    ),
  );
  const entries = msg.allergies();

  it("AC-1: one entry per IAM; the NTE and IAR children yield none", () => {
    expect(msg.segments("NTE")).toHaveLength(2);
    expect(msg.segments("IAR")).toHaveLength(2);
    expect(entries).toHaveLength(2);
    expect(entries.map((e) => e.source)).toEqual(["IAM", "IAM"]);
  });

  it("AC-1: IAM-2 to IAM-5 in the AL1 path's shapes, IAM-7 components 1 and 2", () => {
    const first = entries[0];
    expect(first?.type).toBe("DA");
    expect(first?.code).toEqual({
      identifier: "PEN",
      text: "Penicillin",
      nameOfCodingSystem: "L",
    });
    expect(first?.severity).toBe("SV");
    expect(first?.reaction).toBe("Hives");
    expect(first?.uniqueIdentifier).toEqual({ entityIdentifier: "ALG-0001", namespaceId: "LAB" });
  });

  it("AC-1: IAM-7 component 2 is carried only when sent", () => {
    const second = entries[1];
    expect(second?.type).toBe("FA");
    expect(second?.code).toEqual({ identifier: "NUT", text: "Peanut", nameOfCodingSystem: "L" });
    expect(second?.severity).toBe("MO");
    expect(second?.reaction).toBe("Swelling");
    expect(second?.uniqueIdentifier).toEqual({ entityIdentifier: "ALG-0002" });
    expect(second?.uniqueIdentifier !== undefined && "namespaceId" in second.uniqueIdentifier).toBe(
      false,
    );
  });
});

describe("allergies(): IAM-6 action code surfaced verbatim (AC-2)", () => {
  // A, D, U, X from Table 0206; S is the deprecated snapshot code; the rest are
  // outside the table or differ only in case, and must not be folded or mapped.
  const verbatim = ["A", "D", "U", "X", "S", "ZZ", "a", "d", "u", "Del"] as const;

  for (const code of verbatim) {
    it(`AC-2: IAM-6 "${code}" is the action code exactly as sent`, () => {
      const entry = onlyEntry(`IAM|1|DA|PEN^Penicillin^L|SV|Hives|${code}|ALG-0001`);
      expect(entry.actionCode).toBe(code);
    });
  }

  it("AC-2: component 1 only, when IAM-6 carries its text and coding system", () => {
    const entry = onlyEntry("IAM|1|DA|PEN^Penicillin^L|SV|Hives|U^Update^HL70206|ALG-0001");
    expect(entry.actionCode).toBe("U");
  });

  it("AC-2: an empty IAM-6 leaves the action code absent, not defaulted to A", () => {
    const entry = onlyEntry("IAM|1|DA|PEN^Penicillin^L|SV|Hives||ALG-0001");
    expect("actionCode" in entry).toBe(false);
    expect(entry.actionCode).toBeUndefined();
  });

  it('AC-2: an IAM-6 of only an explicit null ("") leaves the action code absent', () => {
    const entry = onlyEntry('IAM|1|DA|PEN^Penicillin^L|SV|Hives|""|ALG-0001');
    expect("actionCode" in entry).toBe(false);
  });

  it("AC-2: an IAM-6 whose component 1 is empty leaves the action code absent", () => {
    const entry = onlyEntry("IAM|1|DA|PEN^Penicillin^L|SV|Hives|^Delete^HL70206|ALG-0001");
    expect("actionCode" in entry).toBe(false);
    expect("deleteRequested" in entry).toBe(false);
  });
});

describe("allergies(): the delete-request marker (AC-3)", () => {
  it("AC-3: IAM-6 D marks the entry and still returns every field it carries", () => {
    const entry = onlyEntry(
      "IAM|1|DA^Drug allergy^HL70127|PEN^Penicillin^L|SV|Hives|D|ALG-0001^LAB",
    );
    expect(entry.deleteRequested === true).toBe(true);
    expect(entry).toEqual({
      source: "IAM",
      type: "DA",
      code: { identifier: "PEN", text: "Penicillin", nameOfCodingSystem: "L" },
      severity: "SV",
      reaction: "Hives",
      actionCode: "D",
      deleteRequested: true,
      uniqueIdentifier: { entityIdentifier: "ALG-0001", namespaceId: "LAB" },
    });
  });

  it("AC-3: IAM-6 D with its text and coding system is marked too", () => {
    const entry = onlyEntry("IAM|1|DA|PEN^Penicillin^L|SV|Hives|D^Delete^HL70206|ALG-0001");
    expect(entry.deleteRequested === true).toBe(true);
  });

  const unmarked = [
    ["A", "A"],
    ["U", "U"],
    ["X", "X"],
    ["S", "S"],
    ["empty", ""],
    ["lowercase d", "d"],
    ["unknown", "ZZ"],
  ] as const;

  for (const [label, code] of unmarked) {
    it(`AC-3: IAM-6 ${label} does not carry the marker as true`, () => {
      const entry = onlyEntry(`IAM|1|DA|PEN^Penicillin^L|SV|Hives|${code}|ALG-0001`);
      expect(entry.deleteRequested === true).toBe(false);
    });
  }

  it("AC-3: an AL1 entry never carries the marker as true", () => {
    const entries = parseHL7(
      MSH_A01 + EVN_A01 + PID + "AL1|1|DA|PEN^Penicillin^L|SV|Hives\r",
    ).allergies();
    expect(entries).toHaveLength(1);
    expect(entries[0]?.deleteRequested === true).toBe(false);
  });
});

describe("allergies(): AL1 and IAM interleaved in an ADT^A01 (AC-4)", () => {
  const raw =
    MSH_A01 +
    EVN_A01 +
    PID +
    PV1 +
    "AL1|1|DA|PEN^Penicillin^L|SV|Hives|20240101\r" +
    "IAM|1|DA|PEN^Penicillin^L|SV|Hives|A|ALG-0001\r" +
    "AL1|2|FA|NUT^Peanut^L|MO|Swelling\r" +
    "IAM|2|EA|LTX^Latex^L|MI|Itch|U|ALG-0003\r";
  const entries = parseHL7(raw).allergies();

  it("AC-4: one entry per segment in document order, each naming its segment", () => {
    expect(entries).toHaveLength(4);
    expect(entries.map((e) => e.source)).toEqual(["AL1", "IAM", "AL1", "IAM"]);
    expect(entries.map((e) => e.code?.identifier)).toEqual(["PEN", "PEN", "NUT", "LTX"]);
  });

  it("AC-4: an AL1 and an IAM describing the same allergen stay two entries", () => {
    const penicillin = entries.filter((e) => e.code?.identifier === "PEN");
    expect(penicillin.map((e) => e.source)).toEqual(["AL1", "IAM"]);
    expect(penicillin[0]?.onsetDate?.raw).toBe("20240101");
    expect(penicillin[1]?.actionCode).toBe("A");
  });
});

describe("allergies(): entry count and order over any AL1 / IAM mix (AC-5)", () => {
  // Delimiter-free field content, including the empty string, so a generated
  // segment can be entirely empty (`IAM`, `AL1|||`).
  const fieldArb = fc.oneof(fc.constant(""), fc.stringMatching(/^[A-Za-z0-9 .-]{1,10}$/u));
  const segmentArb = fc.record({
    name: fc.constantFrom("AL1", "IAM", "NTE", "IAR", "DG1", "OBX"),
    fields: fc.array(fieldArb, { maxLength: 9 }),
  });

  it("AC-5: as many entries as AL1 plus IAM segments, sources in segment order", () => {
    fc.assert(
      fc.property(fc.array(segmentArb, { maxLength: 12 }), (segments) => {
        const body = segments
          .map((s) => [s.name, ...s.fields].join("|"))
          .map((line) => `${line}\r`)
          .join("");
        const entries = parseHL7(MSH_A01 + EVN_A01 + PID + body).allergies();
        const expected = segments
          .map((s) => s.name)
          .filter((name) => name === "AL1" || name === "IAM");
        expect(entries.map((e) => e.source)).toEqual(expected);
      }),
      { numRuns: 300, seed: 0x5e_0365 },
    );
  });
});

describe("allergies(): an empty or partial IAM (AC-6)", () => {
  it("AC-6: IAM|1 still yields an entry naming IAM, every empty key absent", () => {
    const entry = onlyEntry("IAM|1");
    expect(entry).toEqual({ source: "IAM" });
    expect(Object.keys(entry)).toEqual(["source"]);
  });

  it("AC-6: IAM-3 without IAM-7 never fills the unique identifier", () => {
    const entry = onlyEntry("IAM|1|DA|PEN^Penicillin^L|SV|Hives|A");
    expect(entry.code?.identifier).toBe("PEN");
    expect("uniqueIdentifier" in entry).toBe(false);
  });

  it("AC-6: an IAM-7 carrying only component 2 never takes component 1 from IAM-3", () => {
    const entry = onlyEntry("IAM|1|DA|PEN^Penicillin^L|SV|Hives|A|^LAB");
    expect(entry.uniqueIdentifier).toEqual({ namespaceId: "LAB" });
    expect(
      entry.uniqueIdentifier !== undefined && "entityIdentifier" in entry.uniqueIdentifier,
    ).toBe(false);
  });
});

describe("allergies(): malformed IAM content (AC-7)", () => {
  const malformed = [
    [
      "extra components and repetitions on every field",
      "IAM|1~9|DA^x^y^z~FA|PEN^Penicillin^L^^^^^^^^^^^^^^^^^^^^EXTRA~NUT|SV^a^b~MO|Hives^more~Rash|A^Add^HL70206^extra~U|ALG-0001^LAB^u^ISO^extra~ALG-0002",
    ],
    [
      "escape sequences",
      "IAM|1|D\\F\\A|P\\S\\EN^Pen\\T\\icillin^L|S\\R\\V|Hi\\E\\ves|\\T\\D|ALG\\F\\0001",
    ],
    ["a repeated IAM-6", "IAM|1|DA|PEN^Penicillin^L|SV|Hives|D~A|ALG-0001"],
    ["subcomponents in IAM-6 component 1", "IAM|1|DA|PEN^Penicillin^L|SV|Hives|D&X|ALG-0001"],
    ["a truncated segment", "IAM|1|DA|PEN^Pen"],
    ["a bare segment name", "IAM"],
  ] as const;

  for (const [label, iam] of malformed) {
    it(`AC-7: ${label} does not throw, and the entry and the array are frozen`, () => {
      expect(() => parseHL7(a60(iam)).allergies()).not.toThrow();
      const entries = parseHL7(a60(iam)).allergies();
      expect(entries).toHaveLength(1);
      expect(Object.isFrozen(entries)).toBe(true);
      for (const entry of entries) {
        expect(entry.source).toBe("IAM");
        expect(Object.isFrozen(entry)).toBe(true);
        if (entry.uniqueIdentifier !== undefined) {
          expect(Object.isFrozen(entry.uniqueIdentifier)).toBe(true);
        }
      }
    });
  }

  it("AC-2, AC-3 on AC-7 input: a repeated IAM-6 surfaces whole and is not marked", () => {
    const entry = onlyEntry("IAM|1|DA|PEN^Penicillin^L|SV|Hives|D~A|ALG-0001");
    expect(entry.actionCode).toBe("D~A");
    expect(entry.deleteRequested === true).toBe(false);
  });

  it("AC-2, AC-3 on AC-7 input: IAM-6 subcomponents surface whole and are not marked", () => {
    const entry = onlyEntry("IAM|1|DA|PEN^Penicillin^L|SV|Hives|D&X|ALG-0001");
    expect(entry.actionCode).toBe("D&X");
    expect(entry.deleteRequested === true).toBe(false);
  });
});

describe("allergies(): AL1 without IAM is unchanged (AC-8)", () => {
  it("AC-8: AL1 fields as before, each naming AL1, with no IAM-only key", () => {
    const entries = parseHL7(
      MSH_A01 +
        EVN_A01 +
        PID +
        "AL1|1|DA|PEN^Penicillin^L|SV|Hives|20250101\r" +
        "AL1|2|FA^Food allergy|NUT^Peanut^L|MO^Moderate|Swelling~Itch\r",
    ).allergies();
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({
      source: "AL1",
      type: "DA",
      code: { identifier: "PEN", text: "Penicillin", nameOfCodingSystem: "L" },
      severity: "SV",
      reaction: "Hives",
    });
    expect(entries[0]?.onsetDate).toMatchObject({ raw: "20250101", precision: "day", year: 2025 });
    expect(entries[1]).toEqual({
      source: "AL1",
      type: "FA",
      code: { identifier: "NUT", text: "Peanut", nameOfCodingSystem: "L" },
      severity: "MO",
      reaction: "Swelling",
    });
    for (const entry of entries) {
      expect("actionCode" in entry).toBe(false);
      expect("uniqueIdentifier" in entry).toBe(false);
      expect(entry.deleteRequested === true).toBe(false);
    }
  });
});

describe("allergies(): neither AL1 nor IAM (AC-9)", () => {
  it("AC-9: returns an empty frozen array", () => {
    const entries = parseHL7(MSH_A60 + EVN_A60 + PID + PV1 + "NTE|1||Synthetic note\r").allergies();
    expect(entries).toEqual([]);
    expect(Object.isFrozen(entries)).toBe(true);
  });
});
