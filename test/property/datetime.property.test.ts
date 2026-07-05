/**
 * Property tests for Phase N datetime fidelity. Three invariants:
 *
 *   1. **Lossless round-trip** — `formatDtm(parseDtm(raw)) === raw` for every
 *      well-formed DTM string across all precision levels and offsets. Proves
 *      the parts capture the value with no zero-fill and no offset drift.
 *   2. **No silent UTC** — a value with no offset is always `hasTimezone:false`
 *      and `dtmToDate` (with no assumption) returns `undefined`; it never
 *      fabricates an instant.
 *   3. **Offset determinism** — a value with an offset resolves to the same
 *      instant regardless of the host timezone.
 */
import { describe, expect, it } from "vitest";
import fc from "fast-check";

import { dtmToDate, formatDtm, parseDtm } from "../../src/parser/dates.js";

const RUN_CONFIG = { numRuns: 500, seed: 0x07_05_2026 } as const;

const pad = (n: number, w: number): string => n.toString().padStart(w, "0");

/**
 * Generate a valid HL7 DTM string at a random precision, with an optional
 * offset. Returns `{ raw, hasTz }` so the invariants can branch on presence.
 */
const dtmArb = fc
  .record({
    year: fc.integer({ min: 1, max: 9999 }),
    month: fc.integer({ min: 1, max: 12 }),
    day: fc.integer({ min: 1, max: 28 }), // 28 keeps every month in range
    hour: fc.integer({ min: 0, max: 23 }),
    minute: fc.integer({ min: 0, max: 59 }),
    second: fc.integer({ min: 0, max: 59 }),
    frac: fc.constantFrom("", "5", "50", "123", "0500"),
    precision: fc.constantFrom("year", "month", "day", "hour", "minute", "second", "fraction"),
    tz: fc.constantFrom("", "+0000", "-0000", "+0500", "-0500", "-0930", "+1400", "-1200"),
  })
  .map((f) => {
    let raw = pad(f.year, 4);
    if (f.precision !== "year") raw += pad(f.month, 2);
    if (!["year", "month"].includes(f.precision)) raw += pad(f.day, 2);
    if (["hour", "minute", "second", "fraction"].includes(f.precision)) raw += pad(f.hour, 2);
    if (["minute", "second", "fraction"].includes(f.precision)) raw += pad(f.minute, 2);
    if (["second", "fraction"].includes(f.precision)) raw += pad(f.second, 2);
    if (f.precision === "fraction") raw += `.${f.frac === "" ? "5" : f.frac}`;
    raw += f.tz;
    return { raw, hasTz: f.tz !== "" };
  });

describe("property: DTM parse→format is lossless (no zero-fill, no offset drift)", () => {
  it("formatDtm(parseDtm(raw)) === raw for every precision + offset", () => {
    fc.assert(
      fc.property(dtmArb, ({ raw }) => {
        const parts = parseDtm(raw);
        expect(parts.valid).toBe(true);
        expect(formatDtm(parts)).toBe(raw);
      }),
      RUN_CONFIG,
    );
  });
});

describe("property: a missing offset is never silently resolved to UTC", () => {
  it("no-tz values are flagged and dtmToDate refuses to guess", () => {
    fc.assert(
      fc.property(dtmArb, ({ raw, hasTz }) => {
        const parts = parseDtm(raw);
        expect(parts.hasTimezone).toBe(hasTz);
        if (!hasTz) {
          expect(parts.offsetMinutes).toBeUndefined();
          expect(dtmToDate(parts)).toBeUndefined();
        } else {
          expect(dtmToDate(parts)).toBeInstanceOf(Date);
        }
      }),
      RUN_CONFIG,
    );
  });
});

describe("property: an offset value resolves deterministically", () => {
  it("dtmToDate is independent of any host-timezone assumption", () => {
    fc.assert(
      fc.property(dtmArb, ({ raw, hasTz }) => {
        if (!hasTz) return;
        const parts = parseDtm(raw);
        // Passing an assumeOffsetMinutes must NOT change an already-zoned value.
        const a = dtmToDate(parts);
        const b = dtmToDate(parts, { assumeOffsetMinutes: 720 });
        expect(a?.getTime()).toBe(b?.getTime());
      }),
      RUN_CONFIG,
    );
  });
});
