/**
 * Property tests for the Phase T typed-composite **encoders**. Two invariants
 * pinned across thousands of generated composites whose leaves are drawn from
 * the delimiter-laden alphabet (so the escape path is heavily exercised):
 *
 *   1. **emit ∘ parse identity** — `parseXxx(encodeXxx(v))` reproduces `v` on
 *      every modelled component, after a real serialize → parse round-trip.
 *   2. **no delimiter injection** — a value full of `|^~\&` re-parses as the
 *      exact string in the exact component, never forging a boundary.
 *
 * Leaves are non-empty and trim-stable (the documented round-trip traps), so a
 * structural-equality failure is a real bug. Synthetic only.
 */

import { describe, expect, it } from "vitest";
import fc from "fast-check";

import {
  buildMessage,
  encodeCe,
  encodeCwe,
  encodeCx,
  encodeHd,
  encodePl,
  encodeXad,
  encodeXcn,
  encodeXpn,
  encodeXtn,
  parseCe,
  parseCwe,
  parseCx,
  parseHd,
  parseHL7,
  parsePl,
  parseXad,
  parseXcn,
  parseXpn,
  parseXtn,
  type RawField,
  type RawRepetition,
} from "../../src/index.js";
import { DEFAULT_ENCODING_CHARACTERS as ENC } from "../../src/parser/delimiters.js";
import { leafValue } from "./_arbitraries.js";

function roundTripField(field: RawField): RawRepetition {
  const msg = buildMessage({ type: "ADT^A01" }).addSegment("NTE", [field]);
  const parsed = parseHL7(msg.toString());
  const nte = parsed.rawSegments.find((s) => s.name === "NTE");
  const rep = nte?.fields[1]?.repetitions[0];
  if (rep === undefined) throw new Error("roundTripField: expected one parsed repetition");
  return rep;
}

/** Same key set as `T`, but each value optional and never `undefined`. */
type Optionalize<T> = { [K in keyof T]?: Exclude<T[K], undefined> };

/**
 * Like `fc.record`, but the generated object drops any `undefined`-valued key
 * (from an `fc.option(..., { nil: undefined })` leaf), so the result matches
 * the composite interfaces under `exactOptionalPropertyTypes` — a missing
 * optional is an absent key, never a present `undefined`.
 */
function record<T>(spec: { [K in keyof T]: fc.Arbitrary<T[K]> }): fc.Arbitrary<Optionalize<T>> {
  return fc.record(spec).map((o) => {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(o as Record<string, unknown>)) {
      if (v !== undefined) out[k] = v;
    }
    return out as Optionalize<T>;
  });
}

/** An optional non-empty, trim-stable leaf. */
const optLeaf = () => fc.option(leafValue(), { nil: undefined });

/** A nested HD that is either omitted or carries at least one component. */
const optHd = () =>
  record({ namespaceId: optLeaf(), universalId: optLeaf(), universalIdType: optLeaf() }).map(
    (hd) => (Object.keys(hd).length > 0 ? hd : undefined),
  );

describe("Phase T property — emit ∘ parse identity", () => {
  it("XPN", () => {
    const arb = record({
      familyName: leafValue(),
      givenName: optLeaf(),
      secondName: optLeaf(),
      suffix: optLeaf(),
      prefix: optLeaf(),
      nameTypeCode: optLeaf(),
    });
    fc.assert(
      fc.property(arb, (v) => {
        expect(parseXpn(roundTripField(encodeXpn(v)), ENC)).toEqual(v);
      }),
    );
  });

  it("XAD", () => {
    const arb = record({
      street: leafValue(),
      otherDesignation: optLeaf(),
      city: optLeaf(),
      stateOrProvince: optLeaf(),
      zipOrPostalCode: optLeaf(),
      country: optLeaf(),
    });
    fc.assert(
      fc.property(arb, (v) => {
        expect(parseXad(roundTripField(encodeXad(v)), ENC)).toEqual(v);
      }),
    );
  });

  it("CX (with nested HD authority)", () => {
    const arb = record({
      idNumber: leafValue(),
      checkDigit: optLeaf(),
      assigningAuthority: optHd(),
      identifierTypeCode: optLeaf(),
      assigningFacility: optLeaf(),
    });
    fc.assert(
      fc.property(arb, (v) => {
        expect(parseCx(roundTripField(encodeCx(v)), ENC)).toEqual(v);
      }),
    );
  });

  it("CWE (core 9)", () => {
    const arb = record({
      identifier: leafValue(),
      text: optLeaf(),
      nameOfCodingSystem: optLeaf(),
      alternateIdentifier: optLeaf(),
      alternateText: optLeaf(),
      nameOfAlternateCodingSystem: optLeaf(),
      originalText: optLeaf(),
    });
    fc.assert(
      fc.property(arb, (v) => {
        expect(parseCwe(roundTripField(encodeCwe(v)), ENC)).toEqual(v);
      }),
    );
  });

  it("CE (6)", () => {
    const arb = record({
      identifier: leafValue(),
      text: optLeaf(),
      nameOfCodingSystem: optLeaf(),
      alternateIdentifier: optLeaf(),
    });
    fc.assert(
      fc.property(arb, (v) => {
        expect(parseCe(roundTripField(encodeCe(v)), ENC)).toEqual(v);
      }),
    );
  });

  it("XTN", () => {
    const arb = record({
      telephoneNumber: leafValue(),
      telecommunicationUseCode: optLeaf(),
      telecommunicationEquipmentType: optLeaf(),
      emailAddress: optLeaf(),
    });
    fc.assert(
      fc.property(arb, (v) => {
        expect(parseXtn(roundTripField(encodeXtn(v)), ENC)).toEqual(v);
      }),
    );
  });

  it("PL (with nested HD facility)", () => {
    const arb = record({
      pointOfCare: leafValue(),
      room: optLeaf(),
      bed: optLeaf(),
      facility: optHd(),
      personLocationType: optLeaf(),
    });
    fc.assert(
      fc.property(arb, (v) => {
        expect(parsePl(roundTripField(encodePl(v)), ENC)).toEqual(v);
      }),
    );
  });

  it("HD", () => {
    const arb = record({
      namespaceId: leafValue(),
      universalId: optLeaf(),
      universalIdType: optLeaf(),
    });
    fc.assert(
      fc.property(arb, (v) => {
        expect(parseHd(roundTripField(encodeHd(v)), ENC)).toEqual(v);
      }),
    );
  });

  it("XCN (with nested HD authority)", () => {
    const arb = record({
      idNumber: leafValue(),
      familyName: optLeaf(),
      givenName: optLeaf(),
      assigningAuthority: optHd(),
      nameTypeCode: optLeaf(),
      identifierTypeCode: optLeaf(),
    });
    fc.assert(
      fc.property(arb, (v) => {
        expect(parseXcn(roundTripField(encodeXcn(v)), ENC)).toEqual(v);
      }),
    );
  });
});

describe("Phase T property — no delimiter injection", () => {
  it("a delimiter-laden XPN never forges a component boundary", () => {
    fc.assert(
      fc.property(leafValue(), leafValue(), (family, given) => {
        const rep = roundTripField(encodeXpn({ familyName: family, givenName: given }));
        const xpn = parseXpn(rep, ENC);
        expect(xpn.familyName).toBe(family);
        expect(xpn.givenName).toBe(given);
        // Never more than the two components we supplied.
        expect(rep.components.length).toBe(2);
      }),
    );
  });
});
