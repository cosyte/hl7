/**
 * XPN — HL7 v2 Extended Person Name composite. 14-component structured-name
 * shape parsed from a `RawRepetition` on demand by `Field.asXpn()` (wired in
 * Plan 04). Fields are OMITTED when absent (exactOptionalPropertyTypes) —
 * NEVER set to `undefined`.
 *
 * Zero runtime deps — pure function over the raw positional tree + `unescape`.
 */

import type { EncodingCharacters, RawRepetition } from "../../parser/types.js";

import { readComponent } from "./_shared.js";

/**
 * HL7 v2 Extended Person Name (XPN) — structured name per HL7 Chapter 2. All
 * 14 components are optional. Fields are OMITTED when the underlying
 * component is absent (exactOptionalPropertyTypes).
 *
 * Component positions (HL7 1-indexed; this interface is 0-indexed by key):
 * 1. familyName
 * 2. givenName
 * 3. secondName (or "second and further given names")
 * 4. suffix (e.g. Jr., III)
 * 5. prefix (e.g. Dr., Mrs.)
 * 6. degree (e.g. MD, PhD)
 * 7. nameTypeCode (L=Legal, M=Maiden, N=Nickname, S=Coded Pseudo-Name, ...)
 * 8. nameRepresentationCode
 * 9. nameContext (flattened to string in v1 — CWE nesting is out of scope)
 * 10. nameValidityRange
 * 11. nameAssemblyOrder (F=family first, G=given first)
 * 12. effectiveDate (raw HL7 TS string — caller may parse via parseDtm)
 * 13. expirationDate
 * 14. professionalSuffix
 *
 * @example
 * ```ts
 * import type { XPN } from "@cosyte/hl7";
 * const name: XPN = { familyName: "Smith", givenName: "Jane", prefix: "Mrs." };
 * ```
 */
export interface XPN {
  readonly familyName?: string;
  readonly givenName?: string;
  readonly secondName?: string;
  readonly suffix?: string;
  readonly prefix?: string;
  readonly degree?: string;
  readonly nameTypeCode?: string;
  readonly nameRepresentationCode?: string;
  readonly nameContext?: string;
  readonly nameValidityRange?: string;
  readonly nameAssemblyOrder?: string;
  readonly effectiveDate?: string;
  readonly expirationDate?: string;
  readonly professionalSuffix?: string;
}

/**
 * Parse an HL7 v2 XPN repetition into a structured `XPN` object. Components
 * are auto-unescaped via `unescape()`. Absent / empty components are OMITTED
 * from the result (exactOptionalPropertyTypes semantics).
 *
 * @example
 * ```ts
 * import { parseXpn, DEFAULT_ENCODING_CHARACTERS } from "@cosyte/hl7";
 * const rep = { components: [
 *   { subcomponents: ["Smith"] },
 *   { subcomponents: ["Jane"] },
 * ] };
 * const xpn = parseXpn(rep, DEFAULT_ENCODING_CHARACTERS);
 * console.log(xpn.familyName); // "Smith"
 * console.log(xpn.givenName);  // "Jane"
 * ```
 */
export function parseXpn(rep: RawRepetition, enc: EncodingCharacters): XPN {
  type Mutable<T> = { -readonly [K in keyof T]?: T[K] };
  const out: Mutable<XPN> = {};

  const familyName = readComponent(rep, 0, enc);
  if (familyName !== undefined) out.familyName = familyName;

  const givenName = readComponent(rep, 1, enc);
  if (givenName !== undefined) out.givenName = givenName;

  const secondName = readComponent(rep, 2, enc);
  if (secondName !== undefined) out.secondName = secondName;

  const suffix = readComponent(rep, 3, enc);
  if (suffix !== undefined) out.suffix = suffix;

  const prefix = readComponent(rep, 4, enc);
  if (prefix !== undefined) out.prefix = prefix;

  const degree = readComponent(rep, 5, enc);
  if (degree !== undefined) out.degree = degree;

  const nameTypeCode = readComponent(rep, 6, enc);
  if (nameTypeCode !== undefined) out.nameTypeCode = nameTypeCode;

  const nameRepresentationCode = readComponent(rep, 7, enc);
  if (nameRepresentationCode !== undefined) out.nameRepresentationCode = nameRepresentationCode;

  const nameContext = readComponent(rep, 8, enc);
  if (nameContext !== undefined) out.nameContext = nameContext;

  const nameValidityRange = readComponent(rep, 9, enc);
  if (nameValidityRange !== undefined) out.nameValidityRange = nameValidityRange;

  const nameAssemblyOrder = readComponent(rep, 10, enc);
  if (nameAssemblyOrder !== undefined) out.nameAssemblyOrder = nameAssemblyOrder;

  const effectiveDate = readComponent(rep, 11, enc);
  if (effectiveDate !== undefined) out.effectiveDate = effectiveDate;

  const expirationDate = readComponent(rep, 12, enc);
  if (expirationDate !== undefined) out.expirationDate = expirationDate;

  const professionalSuffix = readComponent(rep, 13, enc);
  if (professionalSuffix !== undefined) out.professionalSuffix = professionalSuffix;

  return out;
}
