/**
 * AC-13 property test for the immunization administration status: for any string supplied as
 * RXA-20, as RXA-21 and as RXA-5 component 1, the record is `completed` only when RXA-20 is exactly
 * `CP` or `PA`, RXA-21 is empty or exactly `A`, `U` or `X`, and RXA-5 carries no CVX 998; and every
 * record whose RXA-21 is exactly `D` is `delete-requested`.
 *
 * A string is supplied two ways, and both must hold:
 *   - on the wire: written verbatim into the field's position of a parsed message, so delimiters,
 *     escape sequences, whitespace and the `""` null reach the parser as a sender would send them;
 *   - as the field's value: set with `setField`, so the string is the field's decoded value.
 *
 * The messages are synthetic (placeholder PID, made-up control ids).
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { codingSystem, parseHL7, type CWE, type Immunization } from "../../src/index.js";

const RUN_CONFIG = { numRuns: 2000, seed: 0x0322_0323 } as const;

const MSH = "MSH|^~\\&|APP|FAC|IIS|FAC|20260801||VXU^V04|1|P|2.5.1";
const PID = "PID|||X";

/** "Carries CVX 998", read off the RXA-5 triplets the entry surfaces. */
function carriesCvx998(code: CWE | undefined): boolean {
  if (code === undefined) return false;
  const cvx = (system: string | undefined): boolean => codingSystem(system)?.id === "CVX";
  const primary =
    code.identifier === "998" &&
    (codingSystem(code.nameOfCodingSystem) === undefined || cvx(code.nameOfCodingSystem));
  const alternate = code.alternateIdentifier === "998" && cvx(code.nameOfAlternateCodingSystem);
  return primary || alternate;
}

/** The AC-13 oracle over the strings supplied and the entry returned. */
function expectOracle(
  supplied: {
    readonly s5: string;
    readonly system: string;
    readonly s20: string;
    readonly s21: string;
  },
  entry: Immunization | undefined,
): void {
  const classification = entry?.administrationStatus.classification;
  expect(classification).toBeDefined();
  if (classification === "completed") {
    expect(["CP", "PA"]).toContain(supplied.s20);
    expect(["", "A", "U", "X"]).toContain(supplied.s21);
    expect(carriesCvx998(entry?.vaccineCode)).toBe(false);
    expect(supplied.s5 === "998" && supplied.system !== "NDC").toBe(false);
  }
  if (supplied.s21 === "D") expect(classification).toBe("delete-requested");
}

// Characters that make a sender's near-miss: every Table 0322 and Table 0323 letter in both cases,
// the digits of 998, the four component/repetition/escape/subcomponent delimiters, escape-sequence
// letters and hex digits, the null quote, whitespace the parser may trim, and the VT and FS bytes
// it strips.
const nearMissChar = fc.constantFrom(
  ..."ACDENPRUXZacdenpruxz".split(""),
  "9",
  "8",
  "0",
  "^",
  "~",
  "\\",
  "&",
  '"',
  "4",
  "3",
  "H",
  "T",
  " ",
  "\t",
  "\u000B",
  "\u001C",
);

const suppliedString = fc.oneof(
  fc.constantFrom(
    "CP",
    "PA",
    "RE",
    "NA",
    "A",
    "D",
    "U",
    "X",
    "998",
    "",
    '""',
    " CP",
    "CP ",
    "cp",
    "CP~",
    "CP^X",
    "d",
    " D",
    "D ",
    "D~A",
    "D^X",
    "D&X",
    "DEL",
    "Z",
    "\\X44\\",
    "\\X43\\P",
    "\u000BD",
    "D\u001C",
    " 998",
    "998 ",
    "\\X39\\98",
    "0998",
    "998~115",
    "998^x^NDC^115",
  ),
  fc.stringOf(nearMissChar, { maxLength: 6 }),
  fc.string({ maxLength: 8 }),
  fc.fullUnicodeString({ maxLength: 4 }),
);

/**
 * Any string for one field, drawn often enough from that field's own exact codes that a record
 * every rule allows to be `completed` (and a `D` beside a 998) comes up in every run.
 */
function forField(exact: readonly string[]): fc.Arbitrary<string> {
  return fc.oneof(
    { weight: 2, arbitrary: fc.constantFrom(...exact) },
    { weight: 3, arbitrary: suppliedString },
  );
}

const rxa5 = forField(["998", "115"]);
const rxa20 = forField(["CP", "PA", "RE", "NA", ""]);
const rxa21 = forField(["", "A", "U", "X", "D"]);

// A string written on the wire must stay inside its field: the field separator and the segment
// breaks would move it into another field or segment.
const onTheWire = (s: string): boolean => !/[|\r\n]/u.test(s);

// The coding system RXA-5 component 3 claims: CVX in both cases, none, and one that is not CVX.
const system = fc.constantFrom("CVX", "cvx", "", "NDC");

/** A message whose one RXA carries the strings on the wire, RXA-21 followed by one more field. */
function wireMessage(s5: string, sys: string, s20: string, s21: string): string {
  const fields = Array<string>(23).fill("");
  fields[0] = "RXA";
  fields[1] = "0";
  fields[2] = "1";
  fields[3] = "20260801";
  fields[5] = `${s5}^Vaccine^${sys}`;
  fields[6] = "0.5";
  fields[20] = s20;
  fields[21] = s21;
  fields[22] = "20260801";
  return [MSH, PID, fields.join("|")].join("\r");
}

describe("property: AC-13 completed only when every rule allows it, and D always delete-requested", () => {
  it("AC-13: any strings on the wire as RXA-20, RXA-21 and RXA-5 component 1", () => {
    fc.assert(
      fc.property(
        rxa5.filter(onTheWire),
        system,
        rxa20.filter(onTheWire),
        rxa21.filter(onTheWire),
        (s5, sys, s20, s21) => {
          const entry = parseHL7(wireMessage(s5, sys, s20, s21)).immunizations()[0];
          expectOracle({ s5, system: sys, s20, s21 }, entry);
        },
      ),
      RUN_CONFIG,
    );
  });

  it("AC-13: any strings set as the values of RXA-20, RXA-21 and RXA-5 component 1", () => {
    fc.assert(
      fc.property(rxa5, system, rxa20, rxa21, (s5, sys, s20, s21) => {
        const msg = parseHL7(wireMessage("115", sys, "CP", ""))
          .setField("RXA.20", s20)
          .setField("RXA.21", s21)
          .setField("RXA.5.1", s5);
        expectOracle({ s5, system: sys, s20, s21 }, msg.immunizations()[0]);
      }),
      RUN_CONFIG,
    );
  });
});
