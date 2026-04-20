/**
 * HD — HL7 v2 Hierarchic Designator composite. 3-component structured
 * identifier (namespace + universal id + universal id type) parsed from a
 * `RawRepetition` on demand. Fields are OMITTED when absent
 * (exactOptionalPropertyTypes) — NEVER set to `undefined`.
 *
 * Zero runtime deps — pure function over the raw positional tree + `unescape`.
 */

import type { EncodingCharacters, RawRepetition } from "../../parser/types.js";

import { readComponent } from "./_shared.js";

/**
 * HL7 v2 Hierarchic Designator (HD) — per HL7 Chapter 2 data type. All 3
 * components are optional. Fields are OMITTED when the underlying component
 * is absent (exactOptionalPropertyTypes).
 *
 * Component positions (HL7 1-indexed; this interface is 0-indexed by key):
 * 1. namespaceId — application- or facility-scoped identifier (e.g. "EPIC").
 * 2. universalId — globally-unique id (e.g. an OID or UUID string).
 * 3. universalIdType — classifier for `universalId` (ISO, GUID, UUID, DNS,
 *    URI, HL7, HCD, Random, etc.).
 *
 * @example
 * ```ts
 * import type { HD } from "@cosyte/hl7";
 * const authority: HD = { namespaceId: "EPIC", universalId: "1.2.840.114350", universalIdType: "ISO" };
 * ```
 */
export interface HD {
  readonly namespaceId?: string;
  readonly universalId?: string;
  readonly universalIdType?: string;
}

/**
 * Parse an HL7 v2 HD repetition into a structured `HD` object. Components
 * are auto-unescaped via `unescape()`. Absent / empty components are OMITTED
 * from the result (exactOptionalPropertyTypes semantics).
 *
 * @example
 * ```ts
 * import { parseHd, DEFAULT_ENCODING_CHARACTERS } from "@cosyte/hl7";
 * const rep = { components: [
 *   { subcomponents: ["EPIC"] },
 *   { subcomponents: ["1.2.840.114350"] },
 *   { subcomponents: ["ISO"] },
 * ] };
 * const hd = parseHd(rep, DEFAULT_ENCODING_CHARACTERS);
 * console.log(hd.namespaceId);     // "EPIC"
 * console.log(hd.universalIdType); // "ISO"
 * ```
 */
export function parseHd(rep: RawRepetition, enc: EncodingCharacters): HD {
  type Mutable<T> = { -readonly [K in keyof T]?: T[K] };
  const out: Mutable<HD> = {};

  const namespaceId = readComponent(rep, 0, enc);
  if (namespaceId !== undefined) out.namespaceId = namespaceId;

  const universalId = readComponent(rep, 1, enc);
  if (universalId !== undefined) out.universalId = universalId;

  const universalIdType = readComponent(rep, 2, enc);
  if (universalIdType !== undefined) out.universalIdType = universalIdType;

  return out;
}
