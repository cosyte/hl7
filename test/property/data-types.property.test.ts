/**
 * Property tests for the common data types read by name (EI, EIP, CNE, DR, MO,
 * CP, CQ, VID, MSG, PT, FC) and the CWE components 10 to 22: for every type,
 * `parseXxx(encodeXxx(v))` reproduces `v` after a real serialize and re-parse
 * through a message, extras and nested composites included.
 *
 * Leaves are non-empty, trim-stable and drawn from an alphabet that includes
 * the five HL7 delimiters, so every round trip also exercises the escape path:
 * a `&` inside a nested part must come back as a `&` in the same part, never as
 * a new subcomponent. Synthetic only.
 */

import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { checkProperty } from "../_helpers/property.js";

import {
  buildMessage,
  encodeCne,
  encodeCp,
  encodeCq,
  encodeCwe,
  encodeDr,
  encodeEi,
  encodeEip,
  encodeFc,
  encodeMo,
  encodeMsg,
  encodePt,
  encodeVid,
  parseCne,
  parseCp,
  parseCq,
  parseCwe,
  parseDr,
  parseEi,
  parseEip,
  parseFc,
  parseHL7,
  parseMo,
  parseMsg,
  parsePt,
  parseVid,
  type RawField,
  type RawRepetition,
} from "../../src/index.js";
import { DEFAULT_ENCODING_CHARACTERS as ENC } from "../../src/parser/delimiters.js";

/** Encode, serialize inside a real message, re-parse: the field's first repetition. */
function roundTrip(field: RawField): RawRepetition {
  const msg = buildMessage({ type: "ADT^A01" }).addSegment("NTE", [field]);
  const parsed = parseHL7(msg.toString());
  const nte = parsed.rawSegments.find((s) => s.name === "NTE");
  return nte?.fields[1]?.repetitions[0] ?? { components: [] };
}

/** Plain characters plus the five HL7 delimiters; no whitespace, no quote. */
const CHARS = [
  ..."ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_.#/:",
  "|",
  "^",
  "~",
  "\\",
  "&",
];

/** A non-empty leaf that survives the round trip as itself. */
const leaf = (): fc.Arbitrary<string> =>
  fc.string({ unit: fc.constantFrom(...CHARS), minLength: 1, maxLength: 10 });

const optLeaf = () => fc.option(leaf(), { nil: undefined });

/**
 * Preserved extra components: interior empties allowed, the last one never
 * empty (the serializer strips trailing empties, as the parser expects), or
 * none at all.
 */
const optExtras = () =>
  fc.option(
    fc
      .tuple(fc.array(fc.option(leaf(), { nil: "" }), { maxLength: 2 }), leaf())
      .map(([head, last]) => [...head, last]),
    { nil: undefined },
  );

/** Same key set as `T`, each value optional and never a present `undefined`. */
type Optionalize<T> = { [K in keyof T]?: Exclude<T[K], undefined> };

/** `fc.record`, dropping `undefined` values so the result has no present-but-undefined key. */
function record<T>(spec: { [K in keyof T]: fc.Arbitrary<T[K]> }): fc.Arbitrary<Optionalize<T>> {
  return fc.record(spec).map((o) => {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(o as Record<string, unknown>)) {
      if (v !== undefined) out[k] = v;
    }
    return out as Optionalize<T>;
  });
}

/** A record that may come out empty, mapped to `undefined` when it does. */
function optNested<V extends object>(arb: fc.Arbitrary<V>): fc.Arbitrary<V | undefined> {
  return arb.map((v) => (Object.keys(v).length > 0 ? v : undefined));
}

const CODED_NAMES = [
  "identifier",
  "text",
  "nameOfCodingSystem",
  "alternateIdentifier",
  "alternateText",
  "nameOfAlternateCodingSystem",
  "codingSystemVersionId",
  "alternateCodingSystemVersionId",
  "originalText",
  "secondAlternateIdentifier",
  "secondAlternateText",
  "nameOfSecondAlternateCodingSystem",
  "secondAlternateCodingSystemVersionId",
  "codingSystemOid",
  "valueSetOid",
  "valueSetVersionId",
  "alternateCodingSystemOid",
  "alternateValueSetOid",
  "alternateValueSetVersionId",
  "secondAlternateCodingSystemOid",
  "secondAlternateValueSetOid",
  "secondAlternateValueSetVersionId",
] as const;

/** All 22 coded-element names, each optional. */
const coded = () =>
  record(
    Object.fromEntries(CODED_NAMES.map((name) => [name, optLeaf()])) as Record<
      (typeof CODED_NAMES)[number],
      fc.Arbitrary<string | undefined>
    >,
  );

/** A nested coded element: the first 9 names (a nested part has no room past them here). */
const nestedCoded = () =>
  optNested(
    record(
      Object.fromEntries(CODED_NAMES.slice(0, 9).map((name) => [name, optLeaf()])) as Record<
        (typeof CODED_NAMES)[number],
        fc.Arbitrary<string | undefined>
      >,
    ),
  );

const ei = () =>
  record({
    entityIdentifier: optLeaf(),
    namespaceId: optLeaf(),
    universalId: optLeaf(),
    universalIdType: optLeaf(),
  });

/** Assert `parse(encode(v))` equals `v` for every generated `v`. */
function roundTrips<V>(
  arb: fc.Arbitrary<V>,
  encode: (v: V) => RawField,
  parse: (rep: RawRepetition, enc: typeof ENC) => unknown,
): void {
  checkProperty(
    fc.property(arb, (v) => {
      expect(parse(roundTrip(encode(v)), ENC)).toStrictEqual(v);
    }),
  );
}

describe("property: the common data types round-trip through the serializer", () => {
  it("EI", () => {
    roundTrips(
      record({
        entityIdentifier: optLeaf(),
        namespaceId: optLeaf(),
        universalId: optLeaf(),
        universalIdType: optLeaf(),
        extraComponents: optExtras(),
      }),
      encodeEi,
      parseEi,
    );
  });

  it("EIP (nested EIs)", () => {
    roundTrips(
      record({
        placerAssignedIdentifier: optNested(ei()),
        fillerAssignedIdentifier: optNested(ei()),
        extraComponents: optExtras(),
      }),
      encodeEip,
      parseEip,
    );
  });

  it("CNE (22 named components and extras past them)", () => {
    roundTrips(
      fc
        .tuple(coded(), optExtras())
        .map(([named, extras]) =>
          extras === undefined ? named : { ...named, extraComponents: extras },
        ),
      encodeCne,
      parseCne,
    );
  });

  it("CWE components 10 to 22 by name", () => {
    checkProperty(
      fc.property(coded(), (v) => {
        const back = parseCwe(roundTrip(encodeCwe(v)), ENC);
        const { extraComponents: _extras, ...named } = back;
        expect(named).toStrictEqual(v);
        // Reading what was read is stable: extras and names agree with each other.
        expect(parseCwe(roundTrip(encodeCwe(back)), ENC)).toStrictEqual(back);
      }),
    );
  });

  it("DR", () => {
    roundTrips(
      record({
        rangeStartDateTime: optLeaf(),
        rangeEndDateTime: optLeaf(),
        extraComponents: optExtras(),
      }),
      encodeDr,
      parseDr,
    );
  });

  it("MO", () => {
    roundTrips(
      record({ quantity: optLeaf(), denomination: optLeaf(), extraComponents: optExtras() }),
      encodeMo,
      parseMo,
    );
  });

  it("CP (nested MO and nested range units)", () => {
    roundTrips(
      record({
        price: optNested(record({ quantity: optLeaf(), denomination: optLeaf() })),
        priceType: optLeaf(),
        fromValue: optLeaf(),
        toValue: optLeaf(),
        rangeUnits: nestedCoded(),
        rangeType: optLeaf(),
        extraComponents: optExtras(),
      }),
      encodeCp,
      parseCp,
    );
  });

  it("CQ (nested units)", () => {
    roundTrips(
      record({ quantity: optLeaf(), units: nestedCoded(), extraComponents: optExtras() }),
      encodeCq,
      parseCq,
    );
  });

  it("VID (nested coded parts)", () => {
    roundTrips(
      record({
        versionId: optLeaf(),
        internationalizationCode: nestedCoded(),
        internationalVersionId: nestedCoded(),
        extraComponents: optExtras(),
      }),
      encodeVid,
      parseVid,
    );
  });

  it("MSG", () => {
    roundTrips(
      record({
        messageCode: optLeaf(),
        triggerEvent: optLeaf(),
        messageStructure: optLeaf(),
        extraComponents: optExtras(),
      }),
      encodeMsg,
      parseMsg,
    );
  });

  it("PT", () => {
    roundTrips(
      record({ processingId: optLeaf(), processingMode: optLeaf(), extraComponents: optExtras() }),
      encodePt,
      parsePt,
    );
  });

  it("FC (nested class code)", () => {
    roundTrips(
      record({
        financialClassCode: nestedCoded(),
        effectiveDate: optLeaf(),
        extraComponents: optExtras(),
      }),
      encodeFc,
      parseFc,
    );
  });
});
