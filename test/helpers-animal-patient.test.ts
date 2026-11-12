/**
 * An animal patient's species, breed, strain and production class (PID-35 to PID-38): read by
 * `msg.patient` and written by the typed builders' PID input. Each is read only from its own
 * field, omitted when that field is empty, and never inferred; PID-8 reads exactly as before.
 *
 * All codes are local test codes (`L`), synthetic only.
 */

import { describe, expect, it } from "vitest";

import { buildAdt, buildOru, buildVxu, parseHL7, type AdtPatient } from "../src/index.js";

const MSH = "MSH|^~\\&|APP|FAC|||20260102||ADT^A01|1|P|2.5";

/** A PID whose fields are given by position; the rest are empty. */
function pid(fields: Readonly<Record<number, string>>): string {
  const last = Math.max(1, ...Object.keys(fields).map(Number));
  const out: string[] = ["PID"];
  for (let i = 1; i <= last; i++) out.push(fields[i] ?? "");
  return out.join("|");
}

const ANIMAL = `${MSH}\r${pid({
  1: "1",
  3: "TESTPET01^^^CLINIC^MR",
  5: "Test^Patient",
  8: "M",
  35: "SPX01^Test canine^L",
  36: "BRX07^Test breed^L",
  37: "Test strain 4",
  38: "PCX02^Test production class^L~PCX03^Second class^L",
})}`;

describe("msg.patient: PID-35 to PID-38", () => {
  it("reads species, breed, strain and production class at their positions", () => {
    const p = parseHL7(ANIMAL).patient;
    expect(p?.species).toEqual({
      identifier: "SPX01",
      text: "Test canine",
      nameOfCodingSystem: "L",
    });
    expect(p?.breed).toEqual({ identifier: "BRX07", text: "Test breed", nameOfCodingSystem: "L" });
    expect(p?.strain).toBe("Test strain 4");
    expect(p?.productionClass).toEqual({
      identifier: "PCX02",
      text: "Test production class",
      nameOfCodingSystem: "L",
    });
  });

  it("omits each key when its field is empty, and guesses none from other fields", () => {
    const p = parseHL7(`${MSH}\r${pid({ 3: "TESTPET02", 8: "F", 34: "FAC" })}`).patient;
    expect(p).toBeDefined();
    expect(Object.keys(p ?? {})).not.toContain("species");
    expect(Object.keys(p ?? {})).not.toContain("breed");
    expect(Object.keys(p ?? {})).not.toContain("strain");
    expect(Object.keys(p ?? {})).not.toContain("productionClass");
  });

  it("omits a key for the explicit null and for a field with no content", () => {
    const p = parseHL7(`${MSH}\r${pid({ 35: '""', 36: "^^", 37: '""', 38: "~" })}`).patient;
    expect(p?.species).toBeUndefined();
    expect(p?.breed).toBeUndefined();
    expect(p?.strain).toBeUndefined();
    expect(p?.productionClass).toBeUndefined();
  });

  it("reads one field without the others", () => {
    const p = parseHL7(`${MSH}\r${pid({ 37: "Only strain" })}`).patient;
    expect(p?.strain).toBe("Only strain");
    expect(p?.species).toBeUndefined();
    expect(p?.breed).toBeUndefined();
    expect(p?.productionClass).toBeUndefined();
  });

  it("decodes escapes in the strain", () => {
    expect(parseHL7(`${MSH}\r${pid({ 37: "A\\S\\B" })}`).patient?.strain).toBe("A^B");
  });

  it("warns when species, breed or strain repeats, which none of them may, and reads the first", () => {
    const p = parseHL7(
      `${MSH}\r${pid({
        35: "SPX01^Test canine^L~SPX02^Test feline^L",
        36: "BRX07^Test breed^L~BRX08^Other breed^L~BRX09^Third breed^L",
        37: "Test strain 4~Test strain 5",
      })}`,
    ).patient;
    expect(p?.species?.identifier).toBe("SPX01");
    expect(p?.breed?.identifier).toBe("BRX07");
    expect(p?.strain).toBe("Test strain 4");
    expect(p?.warnings).toEqual([
      {
        code: "NON_REPEATING_FIELD_REPEATED",
        message: "Field PID-35 may not repeat but holds 2 repetitions; only the first is read.",
        position: { segmentIndex: 1, fieldIndex: 35 },
      },
      {
        code: "NON_REPEATING_FIELD_REPEATED",
        message: "Field PID-36 may not repeat but holds 3 repetitions; only the first is read.",
        position: { segmentIndex: 1, fieldIndex: 36 },
      },
      {
        code: "NON_REPEATING_FIELD_REPEATED",
        message: "Field PID-37 may not repeat but holds 2 repetitions; only the first is read.",
        position: { segmentIndex: 1, fieldIndex: 37 },
      },
    ]);
    expect(Object.isFrozen(p?.warnings)).toBe(true);
  });

  it("carries no warnings when no field repeats, and none for PID-38, which may", () => {
    const p = parseHL7(ANIMAL).patient;
    expect(Object.keys(p ?? {})).not.toContain("warnings");
    // An empty second repetition still counts: the sender sent two.
    const twice = parseHL7(`${MSH}\r${pid({ 35: "SPX01^Test canine^L~" })}`).patient;
    expect(twice?.warnings?.map((w) => w.position.fieldIndex)).toEqual([35]);
  });

  it("leaves the message's own warnings as they were", () => {
    const msg = parseHL7(`${MSH}\r${pid({ 36: "BRX07~BRX08" })}`);
    const before = [...msg.warnings];
    expect(msg.patient?.warnings).toHaveLength(1);
    expect(msg.warnings).toEqual(before);
  });

  it("leaves PID-8 as the administrative sex code it was, with no neutered reading", () => {
    const p = parseHL7(ANIMAL).patient;
    expect(p?.sex).toBe("M");
    expect(Object.keys(p ?? {}).filter((k) => /neuter|spay|alter/iu.test(k))).toEqual([]);
  });
});

const ANIMAL_INPUT: AdtPatient = {
  identifiers: { idNumber: "TESTPET03", identifierTypeCode: "MR" },
  name: { familyName: "Test", givenName: "Patient" },
  administrativeSex: "F",
  species: { identifier: "SPX02", text: "Test feline", nameOfCodingSystem: "L" },
  breed: { identifier: "BRX^9", nameOfCodingSystem: "L" },
  strain: "Line&7",
  productionClass: { text: "Test class" },
};

/** The PID line of a serialized message. */
function pidLine(text: string): string {
  return text.split("\r").find((line) => line.startsWith("PID|")) ?? "";
}

describe("the typed builders write PID-35 to PID-38", () => {
  const envelope = { controlId: "CTRL01", timestamp: "20260102101500" } as const;

  it("buildAdt writes each at its position, escaped", () => {
    const fields = pidLine(
      buildAdt("A01", { ...envelope, patient: ANIMAL_INPUT }).toString(),
    ).split("|");
    expect(fields[8]).toBe("F");
    expect(fields[35]).toBe("SPX02^Test feline^L");
    expect(fields[36]).toBe("BRX\\S\\9^^L");
    expect(fields[37]).toBe("Line\\T\\7");
    expect(fields[38]).toBe("^Test class");
    expect(fields).toHaveLength(39);
  });

  it("buildAdt round-trips them through msg.patient with no warnings", () => {
    const msg = parseHL7(buildAdt("A01", { ...envelope, patient: ANIMAL_INPUT }).toString());
    expect(msg.warnings).toEqual([]);
    expect(msg.patient?.species).toEqual(ANIMAL_INPUT.species);
    expect(msg.patient?.breed).toEqual(ANIMAL_INPUT.breed);
    expect(msg.patient?.strain).toBe(ANIMAL_INPUT.strain);
    expect(msg.patient?.productionClass).toEqual(ANIMAL_INPUT.productionClass);
    expect(msg.patient?.sex).toBe("F");
  });

  it("buildOru and buildVxu share the same PID mapping, so none is dropped", () => {
    const oru = buildOru({
      ...envelope,
      patient: ANIMAL_INPUT,
      observations: [{ valueType: "ST", identifier: { identifier: "T1" }, value: "x" }],
    });
    const vxu = buildVxu({
      ...envelope,
      patient: ANIMAL_INPUT,
      immunizations: [
        {
          administeredDateTime: "20260102",
          vaccineCode: { identifier: "TV01", nameOfCodingSystem: "L" },
          doseAmount: "1",
        },
      ],
    });
    for (const msg of [oru, vxu]) {
      const p = parseHL7(msg.toString()).patient;
      expect(p?.species).toEqual(ANIMAL_INPUT.species);
      expect(p?.strain).toBe(ANIMAL_INPUT.strain);
      expect(p?.productionClass).toEqual(ANIMAL_INPUT.productionClass);
    }
  });

  it("writes nothing past PID-18 when none of the four is given", () => {
    const fields = pidLine(
      buildAdt("A01", {
        ...envelope,
        patient: { identifiers: { idNumber: "TESTPET04" } },
      }).toString(),
    ).split("|");
    expect(fields.length).toBeLessThanOrEqual(19);
  });
});
