/**
 * Property tests for the Phase M order/medication timing safety contract.
 *
 * The load-bearing claims, over thousands of generated TQ1 segments:
 *   1. `orders()` / `medications()` NEVER throw on arbitrary TQ1 content
 *      (HELPERS-07 holds for the timing extractor).
 *   2. The repeat pattern (TQ1-3) is surfaced as the decoded field value —
 *      never normalized, never resolved to a schedule — for any code string.
 *   3. A parametric `Q<integer><unit>` template's integer is NEVER dropped: the
 *      parsed `interval.count` always equals the authored integer, and the code
 *      is preserved verbatim.
 *   4. Total occurrences is read from TQ1-14 (a strict numeric), never from the
 *      TQ1-11 Text Instruction.
 */

import { describe, expect, it } from "vitest";
import fc from "fast-check";

import { parseHL7 } from "../../src/index.js";

const RUN_CONFIG = { numRuns: 500, seed: 0x0d_5e_2027 } as const;

const MSH = "MSH|^~\\&|APP|FAC|||20250102||ORM^O01|1|P|2.5\r";
const PID = "PID|||X\r";

/** Build a `TQ1` segment from a sparse field map so positions are unambiguous. */
function tq1(fields: Record<number, string>): string {
  const max = Math.max(0, ...Object.keys(fields).map(Number));
  const parts = ["TQ1"];
  for (let i = 1; i <= max; i++) parts.push(fields[i] ?? "");
  return parts.join("|");
}

/** Field content free of HL7 delimiters / line breaks — the parser tolerates it. */
const junkArb = fc.string({ maxLength: 12 }).filter((s) => !/[|^~\\&\r\n]/u.test(s));
/** A non-empty Table-0335-shaped code with no delimiters. */
const codeArb = fc.stringMatching(/^[A-Za-z0-9]{1,10}$/u);
const countArb = fc.integer({ min: 1, max: 999 });
const unitArb = fc.constantFrom("S", "M", "H", "D", "W", "L");

describe("property: timing extractors never throw (HELPERS-07)", () => {
  it("tolerates arbitrary TQ1 field content", () => {
    fc.assert(
      fc.property(junkArb, junkArb, junkArb, junkArb, (f2, f3, f7, f14) => {
        const seg = tq1({ 1: "1", 2: f2, 3: f3, 7: f7, 14: f14 });
        expect(() => {
          parseHL7(`${MSH}${PID}${seg}\rOBR|1|A|B|X^^L\r`).orders();
          parseHL7(`${MSH}${PID}${seg}\rRXE|1|D^Drug^RXN\r`).medications();
        }).not.toThrow();
      }),
      RUN_CONFIG,
    );
  });
});

describe("property: repeat pattern surfaced as the decoded field value (never normalized)", () => {
  it("the authored TQ1-3 code always round-trips into repeatPattern.code", () => {
    fc.assert(
      fc.property(codeArb, (code) => {
        const raw = `${MSH}${PID}TQ1|1||${code}\rOBR|1|A|B|X^^L\r`;
        const t = parseHL7(raw).orders()[0]?.timings[0];
        expect(t?.repeatPattern?.code).toBe(code);
      }),
      RUN_CONFIG,
    );
  });
});

describe("property: parametric Q<n><unit> integer is never dropped", () => {
  it("interval.count equals the authored integer and the code is verbatim", () => {
    fc.assert(
      fc.property(countArb, unitArb, (count, unit) => {
        const code = `Q${String(count)}${unit}`;
        const raw = `${MSH}${PID}TQ1|1||${code}\rOBR|1|A|B|X^^L\r`;
        const t = parseHL7(raw).orders()[0]?.timings[0];
        expect(t?.repeatPattern?.code).toBe(code);
        expect(t?.repeatPattern?.kind).toBe("parametric");
        expect(t?.repeatPattern?.interval).toEqual({ count, unit });
      }),
      RUN_CONFIG,
    );
  });
});

describe("property: total occurrences is TQ1-14, not TQ1-11", () => {
  it("a numeric TQ1-14 surfaces as totalOccurrences regardless of TQ1-11 text", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 999 }), junkArb, (total, instruction) => {
        // TQ1-11 (Text Instruction) carries junk; TQ1-14 carries the count.
        const seg = tq1({ 1: "1", 3: "Q6H", 11: instruction, 14: String(total) });
        const t = parseHL7(`${MSH}${PID}${seg}\rOBR|1|A|B|X^^L\r`).orders()[0]?.timings[0];
        expect(t?.totalOccurrences).toBe(total);
      }),
      RUN_CONFIG,
    );
  });
});
