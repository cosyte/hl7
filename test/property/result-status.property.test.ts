/**
 * AC-7 property test for the result status classification: for any string supplied as OBX-11 or
 * as OBR-25, the classification is `final` only when the string is exactly `F`, and every string
 * outside the mapped codes of Table 0085 (OBX-11) or Table 0123 (OBR-25) is `undetermined`.
 *
 * A string is supplied two ways, and both must hold:
 *   - on the wire: written verbatim into the field's position of a parsed message, so delimiters,
 *     escape sequences, whitespace and the `""` null reach the parser as a sender would send them;
 *   - as the field's value: set with `setField`, so the string is the field's decoded value.
 *
 * The messages are synthetic (placeholder PID, made-up order numbers and test codes).
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { parseHL7, type ResultStatusClass } from "../../src/index.js";

const RUN_CONFIG = { numRuns: 2000, seed: 0x0085_0123 } as const;

const MSH = "MSH|^~\\&|APP|FAC|||20250102||ORU^R01|1|P|2.5";
const PID = "PID|||X";

const OBSERVATION_MAPPED: ReadonlyMap<string, ResultStatusClass> = new Map([
  ["A", "amended"],
  ["C", "corrected"],
  ["D", "entered-in-error"],
  ["F", "final"],
  ["P", "preliminary"],
  ["X", "cancelled"],
  ["W", "entered-in-error"],
]);

const ORDER_MAPPED: ReadonlyMap<string, ResultStatusClass> = new Map([
  ["O", "registered"],
  ["I", "registered"],
  ["S", "registered"],
  ["P", "preliminary"],
  ["C", "corrected"],
  ["R", "partial"],
  ["F", "final"],
  ["X", "cancelled"],
]);

/** The AC-7 oracle: `final` only for exactly `F`; anything outside the mapped codes undetermined. */
function expectOracle(
  supplied: string,
  actual: ResultStatusClass | undefined,
  mapped: ReadonlyMap<string, ResultStatusClass>,
): void {
  if (actual === "final") expect(supplied).toBe("F");
  expect(actual).toBe(mapped.get(supplied) ?? "undetermined");
}

// Characters that make a sender's near-miss: every table letter in both cases, the four
// component/repetition/escape/subcomponent delimiters, escape-sequence letters and hex digits,
// the null quote, whitespace the parser may trim, and the VT and FS bytes it strips.
const nearMissChar = fc.constantFrom(
  ..."ABCDFIMNOPRSUVWXYZabcdfimnoprsuvwxyz".split(""),
  "^",
  "~",
  "\\",
  "&",
  '"',
  "4",
  "6",
  "H",
  "E",
  "T",
  " ",
  "\t",
  "\u000B",
  "\u001C",
  " ",
);

const suppliedString = fc.oneof(
  fc.constantFrom(
    "F",
    "W",
    "D",
    "X",
    "U",
    "V",
    "A",
    "N",
    "",
    '""',
    " F",
    "F ",
    "f",
    "FF",
    "F~W",
    "F^X",
    "F&X",
    "F~",
    "\\X46\\",
    "\\x46\\",
    "\u000BF",
    "F\u001C",
    "\u000BF\u001C",
  ),
  fc.stringOf(nearMissChar, { maxLength: 6 }),
  fc.string({ maxLength: 8 }),
  fc.fullUnicodeString({ maxLength: 4 }),
);

// A string written on the wire at OBX-11 / OBR-25 must stay inside that field: the field separator
// and the segment breaks would move it into another field or segment.
const wireString = suppliedString.filter((s) => !/[|\r\n]/u.test(s));

/** A message whose OBR-25 and OBX-11 are both `status` on the wire, each followed by one more field. */
function wireMessage(status: string): string {
  const obr = Array<string>(27).fill("");
  obr[0] = "OBR";
  obr[1] = "1";
  obr[2] = "PLACER1";
  obr[4] = "GLU^Test^L";
  obr[25] = status;
  obr[26] = "1";
  const obx = ["OBX", "1", "ST", "GLU^Test^L", "", "text", "", "", "", "", "", status, "20250102"];
  return [MSH, PID, obr.join("|"), obx.join("|")].join("\r");
}

describe("property: AC-7 final only for exactly F, undetermined outside the mapped codes", () => {
  it("AC-7: any string on the wire as OBX-11", () => {
    fc.assert(
      fc.property(wireString, (s) => {
        const classification = parseHL7(wireMessage(s)).observations()[0]?.resultStatus
          .classification;
        expectOracle(s, classification, OBSERVATION_MAPPED);
      }),
      RUN_CONFIG,
    );
  });

  it("AC-7: any string on the wire as OBR-25", () => {
    fc.assert(
      fc.property(wireString, (s) => {
        const classification = parseHL7(wireMessage(s)).orders()[0]?.resultStatus.classification;
        expectOracle(s, classification, ORDER_MAPPED);
      }),
      RUN_CONFIG,
    );
  });

  it("AC-7: any string set as the value of OBX-11 and of OBR-25", () => {
    fc.assert(
      fc.property(suppliedString, (s) => {
        const msg = parseHL7(wireMessage("P")).setField("OBX.11", s).setField("OBR.25", s);
        expectOracle(s, msg.observations()[0]?.resultStatus.classification, OBSERVATION_MAPPED);
        expectOracle(s, msg.orders()[0]?.resultStatus.classification, ORDER_MAPPED);
      }),
      RUN_CONFIG,
    );
  });
});
