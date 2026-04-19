/**
 * XAD — HL7 v2 Extended Address composite. 12-component structured address
 * shape parsed from a `RawRepetition` on demand by `Field.asXad()` (wired in
 * Plan 04). Fields are OMITTED when absent (exactOptionalPropertyTypes) —
 * NEVER set to `undefined`.
 *
 * Zero runtime deps — pure function over the raw positional tree + `unescape`.
 */

import type { EncodingCharacters, RawRepetition } from "../../parser/types.js";

import { readComponent } from "./_shared.js";

/**
 * HL7 v2 Extended Address (XAD) — structured postal address per HL7 Chapter
 * 2. All 12 components are optional. Fields are OMITTED when the underlying
 * component is absent (exactOptionalPropertyTypes).
 *
 * Component positions (HL7 1-indexed; this interface is 0-indexed by key):
 * 1. street — street address (house number + street name).
 * 2. otherDesignation — apartment number, suite, floor, etc.
 * 3. city
 * 4. stateOrProvince
 * 5. zipOrPostalCode
 * 6. country (ISO-3166 3-letter, e.g. "USA", "CAN")
 * 7. addressType (H=Home, B=Business, M=Mailing, O=Office, P=Permanent, ...)
 * 8. otherGeographicDesignation
 * 9. countyParishCode
 * 10. censusTract
 * 11. addressRepresentationCode
 * 12. addressValidityRange
 *
 * @example
 * ```ts
 * import type { XAD } from "@cosyte/hl7-parser";
 * const addr: XAD = { street: "123 Main St", city: "Boston", stateOrProvince: "MA" };
 * ```
 */
export interface XAD {
  readonly street?: string;
  readonly otherDesignation?: string;
  readonly city?: string;
  readonly stateOrProvince?: string;
  readonly zipOrPostalCode?: string;
  readonly country?: string;
  readonly addressType?: string;
  readonly otherGeographicDesignation?: string;
  readonly countyParishCode?: string;
  readonly censusTract?: string;
  readonly addressRepresentationCode?: string;
  readonly addressValidityRange?: string;
}

/**
 * Parse an HL7 v2 XAD repetition into a structured `XAD` object. Components
 * are auto-unescaped via `unescape()`. Absent / empty components are OMITTED
 * from the result (exactOptionalPropertyTypes semantics).
 *
 * @example
 * ```ts
 * import { parseXad, DEFAULT_ENCODING_CHARACTERS } from "@cosyte/hl7-parser";
 * const rep = { components: [
 *   { subcomponents: ["123 Main St"] },
 *   { subcomponents: ["Apt 4"] },
 *   { subcomponents: ["Boston"] },
 *   { subcomponents: ["MA"] },
 *   { subcomponents: ["02101"] },
 * ] };
 * const addr = parseXad(rep, DEFAULT_ENCODING_CHARACTERS);
 * console.log(addr.city); // "Boston"
 * ```
 */
export function parseXad(rep: RawRepetition, enc: EncodingCharacters): XAD {
  type Mutable<T> = { -readonly [K in keyof T]?: T[K] };
  const out: Mutable<XAD> = {};

  const street = readComponent(rep, 0, enc);
  if (street !== undefined) out.street = street;

  const otherDesignation = readComponent(rep, 1, enc);
  if (otherDesignation !== undefined) out.otherDesignation = otherDesignation;

  const city = readComponent(rep, 2, enc);
  if (city !== undefined) out.city = city;

  const stateOrProvince = readComponent(rep, 3, enc);
  if (stateOrProvince !== undefined) out.stateOrProvince = stateOrProvince;

  const zipOrPostalCode = readComponent(rep, 4, enc);
  if (zipOrPostalCode !== undefined) out.zipOrPostalCode = zipOrPostalCode;

  const country = readComponent(rep, 5, enc);
  if (country !== undefined) out.country = country;

  const addressType = readComponent(rep, 6, enc);
  if (addressType !== undefined) out.addressType = addressType;

  const otherGeographicDesignation = readComponent(rep, 7, enc);
  if (otherGeographicDesignation !== undefined) {
    out.otherGeographicDesignation = otherGeographicDesignation;
  }

  const countyParishCode = readComponent(rep, 8, enc);
  if (countyParishCode !== undefined) out.countyParishCode = countyParishCode;

  const censusTract = readComponent(rep, 9, enc);
  if (censusTract !== undefined) out.censusTract = censusTract;

  const addressRepresentationCode = readComponent(rep, 10, enc);
  if (addressRepresentationCode !== undefined) {
    out.addressRepresentationCode = addressRepresentationCode;
  }

  const addressValidityRange = readComponent(rep, 11, enc);
  if (addressValidityRange !== undefined) out.addressValidityRange = addressValidityRange;

  return out;
}
